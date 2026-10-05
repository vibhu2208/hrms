export default function HelpCenterPage() {
  return (
    <div className="dash-page dash-help">
      <header className="dash-head">
        <h1>Help Center</h1>
        <p>A short guide to the Go Staff admin command center.</p>
      </header>
      <article className="dash-card">
        <h2>People</h2>
        <p>Employees holds the directory. Attendance, Leave, Onboarding, and Offboarding cover the daily HR workflow, including exception approvals.</p>
      </article>
      <article className="dash-card">
        <h2>Work</h2>
        <p>Tasks, Performance, and Recruitment track delivery, reviews, and open roles. Communication and Reports stay under System.</p>
      </article>
      <article className="dash-card">
        <h2>Search and notifications</h2>
        <p>The header search looks up employees by name or code. The bell lists your notifications. Export on the dashboard downloads the figures currently on screen.</p>
      </article>
    </div>
  );
}
