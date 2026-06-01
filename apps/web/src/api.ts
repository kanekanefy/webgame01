import type { Decree, NewGameResponse, TurnResponse } from './types';

const JSON_HEADERS = { 'content-type': 'application/json' };

async function asJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok && data && (data as { error?: string }).error) {
    throw new Error((data as { error?: string }).error);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return data as T;
}

export async function apiNewGame(): Promise<NewGameResponse> {
  const res = await fetch('/api/games', { method: 'POST' });
  return asJson<NewGameResponse>(res);
}

export async function apiTurn(
  gameId: string,
  payload: { decree?: Decree | null; command?: string },
): Promise<TurnResponse> {
  const res = await fetch(`/api/games/${gameId}/turn`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  // 拒绝（rejected）是 200，正常解析；仅网络/4xx-5xx 抛错。
  return asJson<TurnResponse>(res);
}
