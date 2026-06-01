// 时代锁：拦截明显不属于 16 世纪日本战国的概念。
// 注意：火绳枪(铁炮)在战国后期已传入，不算时代错误；拦的是近现代/异世界之物。

// 仅收录「具体的、不会误伤古语/成语」的词。
// 不用裸字（如 电/核/机/球），以免误杀「审核」「电光石火」「相机行事」等。
const ANACHRONISMS: string[] = [
  '飞机', '坦克', '导弹', '火箭', '原子弹', '核弹', '核武', '炸弹', '手雷',
  '电报', '电话', '电脑', '电灯', '电力', '电视', '计算机', '互联网', '网络', '网线', '光纤',
  '手机', '短信', '汽车', '火车', '轮船', '潜艇', '卫星', '雷达', '无人机',
  '机枪', '机关枪', '直升机', '激光', '雷射', '机器人', '克隆',
  '股票', '银行卡', '信用卡', '空调', '冰箱', '收音机', '照相机', '摄像机', '飞船', '宇宙',
  'gun', 'tank', 'plane', 'internet', 'nuke', 'robot', 'laser', 'smartphone', 'computer',
];

export interface PeriodCheck {
  ok: boolean;
  term?: string;
}

export function checkPeriod(command: string): PeriodCheck {
  const text = command.toLowerCase();
  for (const term of ANACHRONISMS) {
    if (text.includes(term.toLowerCase())) return { ok: false, term };
  }
  return { ok: true };
}

export { ANACHRONISMS };
