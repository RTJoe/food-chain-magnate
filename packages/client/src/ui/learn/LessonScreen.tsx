/** #/learn/:lessonId: opens the lesson (resuming at its checkpoint) and shows the table with the coach layer. */
import { useEffect } from 'preact/hooks';
import { lessonById } from '../../tutorial/catalog.js';
import { openLesson } from '../../tutorial/runner.js';
import { navigate } from '../../state/router.js';
import { mode, view } from '../../state/store.js';
import { Button } from '../common.js';
import { Logo } from '../icons.js';
import { Table } from '../Table.js';

export function LessonScreen({ id }: { id: string }) {
  const lesson = lessonById(id);
  useEffect(() => {
    if (!lesson) return;
    const r = openLesson(lesson, true);
    return () => r.exit();
  }, [id]);
  if (!lesson) {
    return (
      <main class="center-page">
        <div class="glass card-narrow">
          <Logo size={48} />
          <h1>Lesson not found</h1>
          <p class="muted">There is no lesson called “{id}” yet.</p>
          <Button variant="primary" icon="arrowRight" onClick={() => navigate({ name: 'learn', lesson: null })}>
            Back to the lessons
          </Button>
        </div>
      </main>
    );
  }
  if (mode.value === 'tutorial' && view.value) return <Table />;
  return (
    <main class="center-page">
      <div class="glass card-narrow">
        <Logo size={48} />
        <h1>{lesson.title}</h1>
        <p class="muted">Setting up the board…</p>
      </div>
    </main>
  );
}
