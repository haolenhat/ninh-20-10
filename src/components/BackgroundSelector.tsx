import React, { useState } from 'react';

interface BackgroundSelectorProps {
  selectedBackground: string;
  onBackgroundChange: (background: string) => void;
}

const BackgroundSelector: React.FC<BackgroundSelectorProps> = ({
  selectedBackground,
  onBackgroundChange
}) => {
  const [showCustomUpload, setShowCustomUpload] = useState(false);
  const [customImageUrl, setCustomImageUrl] = useState('');

  const predefinedBackgrounds = [
    { id: 'none', name: 'Không có nền', thumbnail: null, fullSize: null },
    { id: 'blur', name: 'Xóa phông', thumbnail: null, fullSize: 'blur' },
    { 
      id: 'office', 
      name: 'Văn phòng', 
      thumbnail: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=300&h=200&fit=crop',
      fullSize: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1920&h=1080&fit=crop'
    },
    { 
      id: 'beach', 
      name: 'Bãi biển', 
      thumbnail: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=300&h=200&fit=crop',
      fullSize: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&h=1080&fit=crop'
    },
    { 
      id: 'forest', 
      name: 'Rừng', 
      thumbnail: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=300&h=200&fit=crop',
      fullSize: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1920&h=1080&fit=crop'
    },
    { 
      id: 'city', 
      name: 'Thành phố', 
      thumbnail: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=300&h=200&fit=crop',
      fullSize: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=1920&h=1080&fit=crop'
    },
    { 
      id: 'space', 
      name: 'Không gian', 
      thumbnail: 'https://images.unsplash.com/photo-1446776877081-d282a0f896e2?w=300&h=200&fit=crop',
      fullSize: 'https://images.unsplash.com/photo-1446776877081-d282a0f896e2?w=1920&h=1080&fit=crop'
    }
  ];

  const handleBackgroundSelect = (backgroundId: string) => {
    if (backgroundId === 'none') {
      onBackgroundChange('none');
    } else if (backgroundId === 'custom') {
      setShowCustomUpload(true);
    } else {
      const background = predefinedBackgrounds.find(bg => bg.id === backgroundId);
      if (background && background.fullSize) {
        onBackgroundChange(background.fullSize);
      }
    }
  };

  const handleCustomImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const imageUrl = e.target?.result as string;
        setCustomImageUrl(imageUrl);
        onBackgroundChange(imageUrl);
        setShowCustomUpload(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUrlInput = (url: string) => {
    setCustomImageUrl(url);
    onBackgroundChange(url);
  };

  return (
    <div className="background-selector">
      <h3>Chọn Background</h3>
      
      <div className="background-grid">
        {predefinedBackgrounds.map((background) => (
          <div
            key={background.id}
            className={`background-option ${selectedBackground === background.fullSize ? 'selected' : ''}`}
            onClick={() => handleBackgroundSelect(background.id)}
          >
            {background.thumbnail ? (
              <img
                src={background.thumbnail}
                alt={background.name}
                className="background-thumbnail"
              />
            ) : background.id === 'blur' ? (
              <div className="blur-background-thumbnail">
                <span>🌫️</span>
              </div>
            ) : (
              <div className="no-background-thumbnail">
                <span>Không có nền</span>
              </div>
            )}
            <span className="background-name">{background.name}</span>
          </div>
        ))}
        
        <div
          className={`background-option ${showCustomUpload ? 'selected' : ''}`}
          onClick={() => setShowCustomUpload(true)}
        >
          <div className="custom-background-thumbnail">
            <span>+</span>
          </div>
          <span className="background-name">Tùy chỉnh</span>
        </div>
      </div>

      {showCustomUpload && (
        <div className="custom-upload-section">
          <h4>Tải lên ảnh tùy chỉnh</h4>
          
          <div className="upload-options">
            <div className="file-upload">
              <label htmlFor="image-upload" className="upload-btn">
                Chọn file từ máy tính
              </label>
              <input
                id="image-upload"
                type="file"
                accept="image/*"
                onChange={handleCustomImageUpload}
                style={{ display: 'none' }}
              />
            </div>
            
            <div className="url-input">
              <input
                type="url"
                placeholder="Hoặc nhập URL ảnh"
                value={customImageUrl}
                onChange={(e) => handleUrlInput(e.target.value)}
                className="url-input-field"
              />
            </div>
          </div>
          
          <button
            onClick={() => setShowCustomUpload(false)}
            className="cancel-btn"
          >
            Hủy
          </button>
        </div>
      )}
    </div>
  );
};

export default BackgroundSelector;
