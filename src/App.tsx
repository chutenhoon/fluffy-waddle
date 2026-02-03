import { Route, Routes } from "react-router-dom";
import RequireAuth from "./components/RequireAuth";
import Login from "./pages/Login";
import Gallery from "./pages/Gallery";
import Watch from "./pages/Watch";
import Admin from "./pages/Admin";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Gallery />
          </RequireAuth>
        }
      />
      <Route
        path="/watch/:slug"
        element={
          <RequireAuth>
            <Watch />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <Admin />
          </RequireAuth>
        }
      />
      <Route
        path="*"
        element={
          <RequireAuth>
            <Gallery />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
