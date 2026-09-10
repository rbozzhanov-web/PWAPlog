import { Navigate, Route, Routes } from 'react-router-dom';

function LogbookPlaceholder() {
  return <h1>Pilot Logbook</h1>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/logbook" element={<LogbookPlaceholder />} />
      <Route path="/" element={<Navigate to="/logbook" replace />} />
      <Route path="*" element={<Navigate to="/logbook" replace />} />
    </Routes>
  );
}
