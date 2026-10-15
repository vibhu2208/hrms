import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

const COMPANIES = [
  { name: 'Aith World', host: 'aithworld.localhost' },
  { name: 'TechThrive System', host: 'techthrive.localhost' },
];

export default async function Home() {
  const headerList = await headers();
  const host = headerList.get('host') || '';
  const hostname = host.split(':')[0].toLowerCase();
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    redirect('/login');
  }
  const port = host.includes(':') ? host.split(':')[1] : '3000';

  return (
    <div className="login-page">
      <main className="login-main" style={{ margin: '0 auto' }}>
        <div className="login-brand">
          <strong>Go Staff</strong>
          <span>Choose a company</span>
        </div>
        <div className="login-card">
          <p className="login-kicker">SaaS platform</p>
          <h1>Open a company</h1>
          <p className="login-lead">Each company has its own address and its own data.</p>
          <div className="company-picks">
            {COMPANIES.map((company) => (
              <a key={company.host} className="btn" href={`http://${company.host}:${port}`}>
                {company.name}
              </a>
            ))}
            <a className="btn secondary" href={`http://platform.localhost:${port}`}>
              Platform admin
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
