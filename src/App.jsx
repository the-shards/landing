import { Route, Routes } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Fairness from './pages/Fairness.jsx';
import Signup from './pages/Signup.jsx';
import Login from './pages/Login.jsx';
import Download from './pages/Download.jsx';
import NotFound from './pages/NotFound.jsx';

// react-router ignores a trailing slash, so /fairness and /fairness/ are the same route.
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/fairness" element={<Fairness />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/login" element={<Login />} />
      <Route path="/download" element={<Download />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
