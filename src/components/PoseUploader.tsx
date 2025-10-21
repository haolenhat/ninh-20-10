import React, { useRef, useState, useCallback } from 'react';

interface PoseUploaderProps {
  onPoseImageLoad: (image: HTMLImageElement) => void;
  onPoseDetected: (landmarks: any) => void;
}

const PoseUploader: React.FC<PoseUploaderProps> = ({ onPoseImageLoad, onPoseDetected }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Simple pose analysis based on body proportions
  const analyzeImagePose = useCallback((image: HTMLImageElement) => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      canvas.width = image.width;
      canvas.height = image.height;
      ctx.drawImage(image, 0, 0);

      // Simple body detection based on image analysis
      // This is a simplified version - in a real app you'd use more sophisticated detection
      // const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Find the main subject (assuming it's the largest connected component)
      // For simplicity, we'll use the center area as reference
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      // Calculate basic body proportions (simplified)
      const aspectRatio = canvas.height / canvas.width;
      const relativeCenterX = centerX / canvas.width;
      const relativeCenterY = centerY / canvas.height;
      const areaRatio = 0.3; // Assume person takes ~30% of image
      
      return {
        aspectRatio,
        relativeCenterX,
        relativeCenterY,
        areaRatio,
        bodyWidth: canvas.width * 0.3,
        bodyHeight: canvas.height * 0.6,
        centerX,
        centerY
      };
    } catch (error) {
      console.error('Error analyzing image pose:', error);
      return null;
    }
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const imageUrl = e.target?.result as string;
      setUploadedImage(imageUrl);
      
      // Create image element for pose analysis
      const img = new Image();
      img.onload = async () => {
        onPoseImageLoad(img);
        setIsAnalyzing(true);
        
        // Analyze the image pose
        const poseAnalysis = analyzeImagePose(img);
        if (poseAnalysis) {
          console.log('PoseUploader - Pose analysis completed:', poseAnalysis);
          onPoseDetected(poseAnalysis);
          setIsAnalyzing(false);
        } else {
          console.log('PoseUploader - Failed to analyze pose');
          setIsAnalyzing(false);
        }
      };
      img.src = imageUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveImage = () => {
    setUploadedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };


  return (
    <div className="pose-uploader">
      <h3>Tải ảnh mẫu tư thế</h3>
      
      {!uploadedImage ? (
        <div className="upload-area" onClick={handleUploadClick}>
          <div className="upload-icon">📸</div>
          <p>Nhấn để tải ảnh mẫu</p>
          <p className="upload-hint">Chọn ảnh có người tạo dáng để làm mẫu</p>
        </div>
      ) : (
        <div className="uploaded-image-container">
          <img src={uploadedImage} alt="Pose reference" className="uploaded-image" />
          <div className="image-actions">
            <button onClick={handleUploadClick} className="change-btn">
              Đổi ảnh
            </button>
            <button onClick={handleRemoveImage} className="remove-btn">
              Xóa
            </button>
          </div>
          {isAnalyzing && (
            <div className="analyzing-overlay">
              <div className="spinner"></div>
              <p>Đang phân tích tư thế...</p>
            </div>
          )}
        </div>
      )}
      
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        style={{ display: 'none' }}
      />
    </div>
  );
};

export default PoseUploader;
