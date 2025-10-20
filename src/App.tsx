import { useState } from 'react';
import BackgroundRemover from './components/BackgroundRemover';
import BackgroundSelector from './components/BackgroundSelector';
import './App.css';

function App() {
  const [selectedBackground, setSelectedBackground] = useState<string>('none');

  const handleBackgroundChange = (background: string) => {
    setSelectedBackground(background);
  };

  return (
    <div className="app">

      
      <main className="app-main">
        <div className="video-section">
          <BackgroundRemover 
            selectedBackground={selectedBackground}
            onBackgroundChange={handleBackgroundChange}
          />
        </div>
        
        <div className="controls-section">
          <BackgroundSelector
            selectedBackground={selectedBackground}
            onBackgroundChange={handleBackgroundChange}
          />
        </div>
      </main>
      

    </div>
  );
}

export default App
