/** #/learn routes: the hub, or a lesson. (Rules and glossary live at #/rules, ui/rules.) */
import { LearnHub } from './Hub.js';
import { LessonScreen } from './LessonScreen.js';

export function Learn({ lesson }: { lesson: string | null }) {
  return lesson ? <LessonScreen id={lesson} /> : <LearnHub />;
}

export { continueEntry } from './Hub.js';
