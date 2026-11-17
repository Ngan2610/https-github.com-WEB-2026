import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { guestTrialRemaining } from '../utils/guestTrial.js';

export default function GuestTrialRoute({ children }) {
  const { user } = useAuth();
  const [remaining, setRemaining] = useState(guestTrialRemaining);
  useEffect(() => {
    if (user) return;
    const update = () => setRemaining(guestTrialRemaining());
    update();
    const timer = window.setInterval(update, 1000);
    window.addEventListener('focus', update);
    window.addEventListener('storage', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
      window.removeEventListener('storage', update);
    };
  }, [user]);
  if (user) return children;
  if (remaining <= 0) return <Navigate to="/login" replace state={{ from: '/demo', guestTrialExpired: true }} />;
  return <>
    <p role="status" className="wrap">Dùng thử qua QR còn {Math.ceil(remaining / 60000)} phút. Hết 1 tiếng, bạn cần đăng nhập để tiếp tục.</p>
    {children}
  </>;
}
