import { Route, Routes } from "react-router-dom";
import RequireAuth from "./components/RequireAuth";
import MainLayout from "./components/MainLayout";
import Login from "./pages/Login";
import Gallery from "./pages/Gallery";
import Watch from "./pages/Watch";
import Admin from "./pages/Admin";
import Audio from "./pages/Audio";
import AudioDetail from "./pages/AudioDetail";
import Images from "./pages/Images";
import Notes from "./pages/Notes";
import WebRedirect from "./pages/WebRedirect";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/admin" element={<Admin />} />
      <Route
        element={
          <RequireAuth>
            <MainLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Gallery />} />
        <Route path="/watch/:slug" element={<Watch />} />
        <Route path="/audio" element={<Audio />} />
        <Route path="/audio/:id" element={<AudioDetail />} />
        <Route path="/images" element={<Images />} />
        <Route path="/notes" element={<Notes />} />
        <Route path="/web" element={<WebRedirect />} />
        <Route path="*" element={<Gallery />} />
      </Route>
    </Routes>
  );
}
