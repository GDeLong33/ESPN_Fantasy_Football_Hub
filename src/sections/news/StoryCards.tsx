import { Link } from 'react-router-dom';
import { Byline } from '../../components/Byline';
import { DESKS, type Story } from './stories';

export function LeadStory({ story }: { story: Story | undefined }) {
  if (!story) {
    return (
      <article className="panel lead">
        <div className="lead__body">
          <div className="kicker">Lead story</div>
          <h1 className="display lead__headline">The press box is warming up</h1>
          <p className="lead__summary">
            No stories have been filed yet. Power rankings, trade grades and weekly recaps will land here as
            they're published.
          </p>
        </div>
      </article>
    );
  }
  return (
    <article className="panel lead">
      {story.image && (
        <div className="lead__media">
          <img src={story.image} alt="" />
        </div>
      )}
      <div className="lead__body">
        <div className="kicker">{story.tag}</div>
        <h1 className="display lead__headline">
          <Link to={`/news/${story.slug}`}>{story.title}</Link>
        </h1>
        {story.summary && <p className="lead__summary">{story.summary}</p>}
        <div style={{ marginTop: 16 }}>
          <Byline author={story.author} date={story.date} />
        </div>
      </div>
    </article>
  );
}

export function StoryGrid({ stories }: { stories: Story[] }) {
  if (stories.length === 0) {
    return (
      <div className="story-grid">
        {DESKS.map((desk) => (
          <div key={desk} className="panel story-card story-card--placeholder">
            <div className="kicker">{desk}</div>
            <p className="story-card__title">Coming soon</p>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="story-grid">
      {stories.map((s) => (
        <article key={s.slug} className="panel story-card">
          {s.image && (
            <div className="story-card__media">
              <img src={s.image} alt="" loading="lazy" />
            </div>
          )}
          <div className="kicker">{s.tag}</div>
          <h3 className="story-card__title">
            <Link to={`/news/${s.slug}`}>{s.title}</Link>
          </h3>
          {s.summary && <p className="story-card__summary">{s.summary}</p>}
          <Byline author={s.author} date={s.date} compact />
        </article>
      ))}
    </div>
  );
}
