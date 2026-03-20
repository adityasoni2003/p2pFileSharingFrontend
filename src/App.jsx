import './App.css'
import ShareThat from './components/shareComponent'
import Receiver from './components/recieverComponent'
import { BrowserRouter, Routes, Route } from "react-router-dom"

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ShareThat />} />
        <Route path="/receive/:sessionId" element={<Receiver />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App