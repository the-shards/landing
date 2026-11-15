import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { usePageTitle } from '../components/usePageTitle.js';

export default function NotFound() {
  usePageTitle('Not found - The Shards');
  return (
    <Layout prose>
      <section className="intro" aria-labelledby="missing-title">
        <div className="badge">404</div>
        <h1 id="missing-title" className="display-h1">Nothing here.</h1>
        <p>That page does not exist. <Link to="/">Go to the home page</Link>.</p>
      </section>
    </Layout>
  );
}
