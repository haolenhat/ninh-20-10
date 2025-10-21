import { useState } from 'react';
import BackgroundRemover from './components/BackgroundRemover';
import BackgroundSelector from './components/BackgroundSelector';
import PoseUploader from './components/PoseUploader';
import './App.css';

function App() {
  const [selectedBackground, setSelectedBackground] = useState<string>('none');
  const [referencePose, setReferencePose] = useState<any>(null);
  const [poseSimilarity, setPoseSimilarity] = useState<number>(0);

  const handleBackgroundChange = (background: string) => {
    setSelectedBackground(background);
  };

  const handlePoseImageLoad = (image: HTMLImageElement) => {
    console.log('Pose image loaded:', image);
  };

  const handlePoseDetected = (landmarks: any) => {
    console.log('Pose detected:', landmarks);
    setReferencePose(landmarks);
  };

  const handlePoseSimilarity = (similarity: number) => {
    setPoseSimilarity(similarity);
    console.log('Pose similarity:', (similarity * 100).toFixed(1) + '%');
  };

  return (
    <div className="app">
      {referencePose && (
        <div className="app-header">
          <h1>🎯 Pose Matching Camera</h1>
          <p>Độ tương đồng hiện tại: {(poseSimilarity * 100).toFixed(0)}%</p>
        </div>
      )}
      
      <main className="app-main">
        <div className="video-section">
          <BackgroundRemover 
            selectedBackground={selectedBackground}
            onBackgroundChange={handleBackgroundChange}
            onPoseSimilarity={handlePoseSimilarity}
            referencePose={referencePose}
          />
        </div>
        
        <div className="controls-section">
          <PoseUploader
            onPoseImageLoad={handlePoseImageLoad}
            onPoseDetected={handlePoseDetected}
          />
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
