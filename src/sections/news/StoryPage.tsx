import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Byline } from '../../components/Byline';
import { DataState } from '../../components/DataState';
import { useAsync } from '../../lib/useAsync';
import { LEAGUE_NAME } from '../../site';
import { loadStory, renderMarkdown, type Story } from './stories';

export function StoryPage() {
  const { slug = '' } = useParams();
  const state = useAsync(() => loadStory(slug), [slug]);

  return (
    <div className="container article">
      <DataState state={state} loading="Loading story…">
        {(story) => (story ? <Article story={story} /> : <NotFound />)}
      </DataState>
    </div>
  );
}

function Article({ story }: { story: Story }) {
  const html = useMemo(() => renderMarkdown(story.body), [story.body]);
  useEffect(() => {
    document.title = `${story.title} · ${LEAGUE_NAME}`;
    return () => {
      document.title = LEAGUE_NAME;
    };
  }, [story.title]);

  return (
    <article>
      <div className="kicker">{story.tag}</div>
      <h1 className="display article__title">{story.title}</h1>
      <Byline author={story.author} date={story.date} />
      {story.image && <img className="article__media" src={story.image} alt="" />}
      <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
      <p>
        <Link className="text-link" to="/">
          ← Back to the front page
        </Link>
      </p>
    </article>
  );
}

function NotFound() {
  return (
    <div>
      <h1 className="display article__title">Story not found</h1>
      <p className="muted">It may have been moved or unpublished.</p>
      <Link className="text-link" to="/">
        ← Back to the front page
      </Link>
    </div>
  );
}
