#!/bin/bash
# Claude Code PreToolUse hook: Validates git commit commands (web / TypeScript stack)
# Receives JSON on stdin with tool_input.command
# Exit 0 = allow, Exit 2 = block (stderr shown to Claude)
#
# Input schema (PreToolUse for Bash):
# { "tool_name": "Bash", "tool_input": { "command": "git commit -m ..." } }

INPUT=$(cat)

# Parse command -- use jq if available, fall back to grep
if command -v jq >/dev/null 2>&1; then
    COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
else
    COMMAND=$(echo "$INPUT" | grep -oE '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/"command"[[:space:]]*:[[:space:]]*"//;s/"$//')
fi

# Only process git commit commands
if ! echo "$COMMAND" | grep -qE '^git[[:space:]]+commit'; then
    exit 0
fi

# Get staged files
STAGED=$(git diff --cached --name-only 2>/dev/null)
if [ -z "$STAGED" ]; then
    exit 0
fi

WARNINGS=""

# Check design documents for required sections
DESIGN_FILES=$(echo "$STAGED" | grep -E '^design/gdd/')
if [ -n "$DESIGN_FILES" ]; then
    while IFS= read -r file; do
        if [[ "$file" == *.md ]] && [ -f "$file" ]; then
            for section in "Overview" "Player Fantasy" "Detailed" "Formulas" "Edge Cases" "Dependencies" "Tuning Knobs" "Acceptance Criteria"; do
                if ! grep -qi "$section" "$file"; then
                    WARNINGS="$WARNINGS\nDESIGN: $file missing required section: $section"
                fi
            done
        fi
    done <<< "$DESIGN_FILES"
fi

# Validate JSON data files via node (no python dependency) -- block invalid JSON
DATA_FILES=$(echo "$STAGED" | grep -E '\.json$' | grep -E '(^content/|/content/)')
if [ -n "$DATA_FILES" ]; then
    if command -v node >/dev/null 2>&1; then
        while IFS= read -r file; do
            if [ -f "$file" ]; then
                if ! node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$file" >/dev/null 2>&1; then
                    echo "BLOCKED: $file is not valid JSON" >&2
                    exit 2
                fi
            fi
        done <<< "$DATA_FILES"
    else
        echo "WARNING: Cannot validate JSON (node not found): skipping" >&2
    fi
fi

# Check for hardcoded numeric values in core (should live in content/)
CODE_FILES=$(echo "$STAGED" | grep -E '^packages/core/src/')
if [ -n "$CODE_FILES" ]; then
    while IFS= read -r file; do
        if [ -f "$file" ]; then
            if grep -nE '(damage|health|koku|levy|contentment|prestige|rate|chance|cost|duration)[[:space:]]*[:=][[:space:]]*[0-9]+' "$file" 2>/dev/null; then
                WARNINGS="$WARNINGS\nCODE: $file may contain hardcoded values. Prefer content/ data."
            fi
        fi
    done <<< "$CODE_FILES"
fi

# Check for TODO/FIXME without assignee in TS sources
SRC_FILES=$(echo "$STAGED" | grep -E '^(packages|apps)/.*\.(ts|tsx)$')
if [ -n "$SRC_FILES" ]; then
    while IFS= read -r file; do
        if [ -f "$file" ]; then
            if grep -nE '(TODO|FIXME|HACK)[^(]' "$file" 2>/dev/null; then
                WARNINGS="$WARNINGS\nSTYLE: $file has TODO/FIXME without owner tag. Use TODO(name) format."
            fi
        fi
    done <<< "$SRC_FILES"
fi

# Non-blocking reminder for TS changes
if echo "$STAGED" | grep -qE '\.(ts|tsx)$'; then
    WARNINGS="$WARNINGS\nREMINDER: TS changed -- run 'pnpm -r test' and 'pnpm --filter @sengoku/core exec tsc --noEmit' before pushing."
fi

# Print warnings (non-blocking) and allow commit
if [ -n "$WARNINGS" ]; then
    echo -e "=== Commit Validation Warnings ===$WARNINGS\n================================" >&2
fi

exit 0
