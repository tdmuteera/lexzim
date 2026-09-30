/** Motivation lines for My Day. Unattributed lines are original to LexZim. */
export type MotivationLine = { text: string; by?: string };

export type MotivationMood = "start" | "going" | "last" | "done";

const START: MotivationLine[] = [
  { text: "Blank page, fresh coffee, zero excuses. Add the first thing." },
  { text: "Today's list is empty. Suspiciously empty. Give it a job." },
  { text: "Write it down and it stops living rent free in your head." },
  { text: "Big plans start as small tasks. Pick one." },
  { text: "The first task is the hardest. After that it's just momentum." },
  { text: "Your future self called. They'd love a head start." },
  { text: "A good day is planned before it's lived." },
  { text: "Name three things that would make today a win. Then do one." },
  { text: "Start with the file you've been avoiding. It's smaller than it looks." },
  { text: "Lost time is never found again.", by: "Benjamin Franklin" },
  { text: "Even the longest brief starts with a heading." },
  { text: "Five minutes of planning saves an hour of wondering." },
];

const GOING: MotivationLine[] = [
  { text: "Well done is better than well said.", by: "Benjamin Franklin" },
  { text: "Done is better than perfect. Perfect can come on Friday." },
  { text: "Tick one box. Feel the power. Repeat." },
  { text: "Progress, not perfection. The ring is watching." },
  { text: "Small steps still count. Ask any tortoise." },
  { text: "You don't have to do it all. Just the next one." },
  { text: "That task won't finish itself. We checked." },
  { text: "Eat the frog first. The rest of the menu is easier." },
  { text: "Every tick is a tiny round of applause." },
  { text: "Focus mode on. Notifications can wait five minutes." },
  { text: "The deadline is not the enemy. Procrastination is." },
  { text: "Break it down until it's too small to argue with." },
  { text: "One task at a time. Multitasking is just juggling with worse results." },
  { text: "Your streak believes in you. Don't let it down." },
  { text: "Clients remember the lawyer who did what they said they would." },
  { text: "Clear the small ones fast. Momentum is a real force." },
  { text: "Coffee is temporary. Ticked boxes are forever." },
  { text: "If it takes two minutes, do it now. Yes, now." },
  { text: "Hard work beats talent when talent doesn't make a list." },
  { text: "Motivation gets you started. Habit gets it finished." },
  { text: "Be the reason the ring turns gold today." },
  { text: "A tidy list is a tidy mind. Well, tidier." },
  { text: "Future you is already grateful. Keep going." },
  { text: "Draft now, polish later. Blank pages don't get filed." },
  { text: "The best time to start was an hour ago. The second best is now." },
  { text: "You've handled harder things than this list." },
  { text: "Consistency is a superpower that looks boring from the outside." },
  { text: "Sip, breathe, tick. That's the rhythm." },
  { text: "Don't wait for inspiration. It's usually running late." },
  { text: "A task started is a task half defeated." },
  { text: "The file on your desk is not a paperweight. Open it." },
  { text: "Discipline is choosing what you want most over what you want now." },
  { text: "Tiny progress is still progress. Tiny is underrated." },
  { text: "Your to-do list called. It misses you." },
  { text: "Keep calm and tick the next box." },
  { text: "Great work is just ordinary work done on time." },
  { text: "Winners have lists too. They just finish them." },
  { text: "Chase the tick, not the perfect sentence." },
  { text: "Put the phone face down. The task is face up." },
  { text: "Batch the calls, batch the emails, own the afternoon." },
  { text: "You are one focused hour away from a very good day." },
  { text: "Deadlines are just dates with ambition." },
  { text: "Be stubborn about goals, flexible about methods." },
  { text: "Nobody ever regretted finishing early." },
  { text: "If it matters, it goes on the list. If it's on the list, it gets done." },
  { text: "Your inbox is someone else's to-do list. This one is yours." },
  { text: "Start ugly. Finish proud." },
  { text: "Energy follows action. Move first, feel ready later." },
];

const LAST: MotivationLine[] = [
  { text: "One left. Finish it and do a tiny victory dance." },
  { text: "Last one! The confetti is warming up backstage." },
  { text: "So close you can smell the gold ring." },
  { text: "Final task. Make it count, then make tea." },
  { text: "The finish line is right there. Don't stop to admire it." },
  { text: "One more tick and today officially belongs to you." },
  { text: "Just one to go. Legends close the file." },
  { text: "The last task always looks bigger. It isn't. Go." },
];

const DONE: MotivationLine[] = [
  { text: "Everything done. Take a bow, counsel." },
  { text: "List cleared. Somewhere, a deadline is weeping." },
  { text: "All done! Plan tomorrow while you're on a roll." },
  { text: "Clean sweep. Your streak just did a happy dance." },
  { text: "Nothing left. Go home on time for once." },
  { text: "Case closed for today. Brilliant work." },
  { text: "Every box ticked. That's what winning looks like." },
  { text: "Today: handled. Tomorrow: already nervous." },
  { text: "You did the thing. All the things, actually." },
  { text: "Perfect day. Add something for tomorrow and keep the streak alive." },
];

export const MOTIVATION: Record<MotivationMood, MotivationLine[]> = {
  start: START,
  going: GOING,
  last: LAST,
  done: DONE,
};

export function motivationMood(open: number, total: number): MotivationMood {
  if (!total) return "start";
  if (open === 0) return "done";
  if (open === 1) return "last";
  return "going";
}
