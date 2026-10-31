import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { PixelBurst } from './PixelBurst';

export function TearEdge() {
  const points = Array.from({ length: 61 }, (_, i) => `${i * 10},${i % 2 ? 11 : 1}`).join(' ');
  return (
    <svg className="tear-edge" viewBox="0 0 600 12" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`0,0 600,0 ${points.split(' ').reverse().join(' ')}`} />
      <polyline points={points} />
    </svg>
  );
}

export function PageHeading({ number, title, description, children }: {
  number: string; title: string; description: string; children?: ReactNode;
}) {
  return <div className="page-heading">
    <div className="eyebrow"><span className="index-label">{number}</span> 你的练习手帐</div>
    <div className="heading-row"><div><h1>{title}</h1><p className="lede">{description}</p></div>{children}</div>
  </div>;
}

export function PaperArt() {
  return <motion.div className="paper-art" aria-hidden="true" whileHover={{ rotate: -3, y: -5 }} transition={{ type: 'spring', stiffness: 220, damping: 19 }}>
    <div className="art-spark spark-one">✳</div><div className="art-spark spark-two">+</div>
    <div className="ticket-back" />
    <div className="ticket-front"><span className="paper-tape" /><div className="ticket-top"><span>练习入场券</span><b>↗</b></div>
      <div className="ticket-message">一题一题，<br/>把进步攒起来。</div>
      <div className="ticket-rule" /><div className="ticket-bottom"><span>随时开始 · 无限次尝试</span><span className="pixel-check">✓</span></div>
      <TearEdge />
    </div><span className="art-caption">今天也有新的可能。</span>
  </motion.div>;
}

export function FeedbackPaper({ correct, answer, explanation, burstKey, reference, animateEntry = true, titleId }: {
  correct: boolean; answer: string[]; explanation: string; burstKey: number; reference?: ReactNode; animateEntry?: boolean; titleId?: string;
}) {
  const reduced = useReducedMotion();
  return <motion.div className={`feedback-wrap ${correct ? 'is-correct' : 'is-incorrect'}`}
    initial={reduced || !animateEntry ? false : { opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: reduced ? 0 : .56, ease: [.42, 0, .35, 1] }}>
    <span className="tear-tab" aria-hidden="true">答案揭晓 ↗</span>
    <div className="feedback-sheet">
    <div className={`feedback ${correct ? 'success' : 'error'}`}>
      <div role="status" aria-live="polite" className="feedback-status">
      <div className="feedback-title"><span className="feedback-symbol" aria-hidden="true">{correct ? '✓' : '×'}
        {correct && burstKey > 0 && <PixelBurst key={burstKey} tone="correct" />}
      </span><div><span className="eyebrow">{correct ? '这一题，拿下！' : '再巩固一点'}</span><h3 id={titleId}>{correct ? '回答正确！' : `正确答案：${answer.join('、')}`}</h3></div></div>
      {correct && <div className="feedback-answer">本轮正确选项：<b>{answer.join('、')}</b></div>}
      </div>
      <motion.div className="explanation" initial={reduced || !animateEntry ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduced ? 0 : .56, delay: reduced || !animateEntry ? 0 : .09, ease: [.42, 0, .35, 1] }}>
        <span className="explanation-label">题目解析</span><p>{explanation || '本题暂无文字解析。'}</p>{reference}</motion.div>
    </div><TearEdge /></div>
  </motion.div>;
}
