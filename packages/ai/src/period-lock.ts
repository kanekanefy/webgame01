// 时代锁：拦截明显不属于 16 世纪日本战国的概念。
// 注意：火绳枪(铁炮)在战国后期已传入，不算时代错误；拦的是近现代/异世界之物。

const ANACHRONISMS: string[] = [
  '飞机', '飞行', '坦克', '导弹', '火箭', '核', '原子', '炸弹', '手雷',
  '电', '电报', '电话', '电脑', '计算机', '互联网', '网络', '网线', '光纤',
  '手机', '短信', '汽车', '火车', '轮船', '潜艇', '卫星', '雷达', '无人机',
  '机枪', '机关枪', '坦克车', '直升机', '激光', '雷射', '机器人', '克隆',
  '股票', '银行卡', '信用卡', '空调', '冰箱', '电视', '收音机', '相机', '摄像',
  'gun', 'tank', 'plane', 'internet', 'nuke', 'robot', 'laser', 'phone', 'computer',
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
