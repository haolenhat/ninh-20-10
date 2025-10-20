import React, { useRef, useEffect, useState, useCallback } from 'react';
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation';
import { Camera } from '@mediapipe/camera_utils';

interface BackgroundRemoverProps {
  selectedBackground: string;
  onBackgroundChange: (background: string) => void;
}

const BackgroundRemover: React.FC<BackgroundRemoverProps> = ({ 
  selectedBackground, 
  onBackgroundChange: _onBackgroundChange 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isFlipped] = useState(true); // Auto-flip camera by default
  const [distance, setDistance] = useState<number>(0);
  const [isInRange, setIsInRange] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const previousDistanceRef = useRef<number>(0);
  const selfieSegmentationRef = useRef<SelfieSegmentation | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const backgroundImageRef = useRef<HTMLImageElement | null>(null);
  const originalImageRef = useRef<HTMLCanvasElement | null>(null);

  // Estimate distance based on person size in frame
  const estimateDistance = useCallback((segmentationMask: any, imageWidth: number, imageHeight: number) => {
    try {
      // Create a temporary canvas to analyze the mask
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = imageWidth;
      tempCanvas.height = imageHeight;
      const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D | null;
      
      if (!tempCtx) return 0;
      
      // Draw the segmentation mask
      tempCtx.drawImage(segmentationMask, 0, 0, imageWidth, imageHeight);
      
      // Get image data to count pixels (use alpha channel for reliability)
      const imageData = tempCtx.getImageData(0, 0, imageWidth, imageHeight);
      const data = imageData.data;
      
      let personPixels = 0;
      let totalPixels = imageWidth * imageHeight;
      
      // Count white pixels (person area)
      let minX = imageWidth, maxX = 0, minY = imageHeight, maxY = 0;
      let hasPerson = false;
      
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3]; // alpha channel
        // Alpha near 255 means person area in MediaPipe mask
        if (a > 200) {
          personPixels++;
          hasPerson = true;
          
          // Calculate bounding box
          const x = (i / 4) % imageWidth;
          const y = Math.floor((i / 4) / imageWidth);
          
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
      
      // Calculate person area ratio
      const personRatio = personPixels / totalPixels;
      
      // Calculate bounding box area as backup method
      const boundingBoxArea = hasPerson ? (maxX - minX) * (maxY - minY) : 0;
      const boundingBoxRatio = boundingBoxArea / totalPixels;
      
      // Debug logging
      console.log(`Person pixels: ${personPixels}, Total pixels: ${totalPixels}, Ratio: ${personRatio.toFixed(4)}`);
      console.log(`Bounding box: ${boundingBoxArea}, Bounding ratio: ${boundingBoxRatio.toFixed(4)}`);
      
      // Use the larger ratio for distance estimation
      const effectiveRatio = Math.max(personRatio, boundingBoxRatio);
      
      // Estimate distance based on person size
      // Closer person = larger ratio = smaller distance
      // Further person = smaller ratio = larger distance
      let estimatedDistance = 0;
      
      if (effectiveRatio > 0.25) {
        estimatedDistance = 0.5; // Very close
      } else if (effectiveRatio > 0.15) {
        estimatedDistance = 0.8; // Close
      } else if (effectiveRatio > 0.08) {
        estimatedDistance = 1.2; // Medium-close
      } else if (effectiveRatio > 0.04) {
        estimatedDistance = 1.8; // Medium
      } else if (effectiveRatio > 0.01) {
        estimatedDistance = 2.2; // Far
      } else {
        estimatedDistance = 2.5; // Very far
      }
      
      console.log(`Effective ratio: ${effectiveRatio.toFixed(4)}, Estimated distance: ${estimatedDistance}m`);
      return estimatedDistance;
    } catch (error) {
      console.error('Error estimating distance:', error);
      return 0;
    }
  }, []);

  const initializeMediaPipe = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    try {
      const selfieSegmentation = new SelfieSegmentation({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
        }
      });

      selfieSegmentation.setOptions({
        modelSelection: 1, // 0 for general, 1 for landscape
        selfieMode: true,
      });

      selfieSegmentation.onResults((results) => {
        if (!canvasRef.current || !videoRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas size to 16:9 aspect ratio with high quality
        const targetWidth = 1280;
        const targetHeight = 720;
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        // Enable high quality rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Apply flip transformation if needed
        if (isFlipped) {
          ctx.save();
          ctx.scale(-1, 1);
          ctx.translate(-targetWidth, 0);
        }

        // Store original image for capture
        if (!originalImageRef.current) {
          originalImageRef.current = document.createElement('canvas');
          originalImageRef.current.width = targetWidth;
          originalImageRef.current.height = targetHeight;
        }
        const originalCtx = originalImageRef.current.getContext('2d');
        if (originalCtx) {
          originalCtx.clearRect(0, 0, targetWidth, targetHeight);
          
        // Store original image WITHOUT flip (for capture)
        originalCtx.drawImage(results.image, 0, 0, targetWidth, targetHeight);
        }

        // Estimate distance and check if in range
        const rawDistance = estimateDistance(results.segmentationMask, targetWidth, targetHeight);
        
        // Smooth the distance to avoid jittery readings
        const smoothingFactor = 0.3;
        const smoothedDistance = previousDistanceRef.current === 0 
          ? rawDistance 
          : previousDistanceRef.current * (1 - smoothingFactor) + rawDistance * smoothingFactor;
        
        previousDistanceRef.current = smoothedDistance;
        setDistance(smoothedDistance);
        
        // Check if person is within 1 meter (with some tolerance)
        const inRange = smoothedDistance <= 1.0; // 1.0m threshold
        setIsInRange(inRange);
        
        // Debug logging
        console.log(`Raw: ${rawDistance.toFixed(2)}m, Smoothed: ${smoothedDistance.toFixed(2)}m, In Range: ${inRange}, Background: ${selectedBackground}`);

        // Draw background first, then person
        if (selectedBackground && selectedBackground !== 'none' && inRange) {
          if (selectedBackground === 'blur') {
            // Blur background effect - draw original image with blur
            console.log('Drawing blur background');
            
            // Create a temporary canvas for the blurred background
            const blurCanvas = document.createElement('canvas');
            blurCanvas.width = targetWidth;
            blurCanvas.height = targetHeight;
            const blurCtx = blurCanvas.getContext('2d');
            
            if (blurCtx) {
              // Draw the original image
              blurCtx.drawImage(results.image, 0, 0, targetWidth, targetHeight);
              
              // Apply blur effect
              blurCtx.filter = 'blur(8px)';
              blurCtx.drawImage(results.image, 0, 0, targetWidth, targetHeight);
              
              // Draw the blurred background
              ctx.drawImage(blurCanvas, 0, 0, targetWidth, targetHeight);
            }
            
            // Create a temporary canvas for the person
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = targetWidth;
            tempCanvas.height = targetHeight;
            const tempCtx = tempCanvas.getContext('2d');
            
            if (tempCtx) {
              // Clear temp canvas first
              tempCtx.clearRect(0, 0, targetWidth, targetHeight);
              
              // Draw the person image on temp canvas
              tempCtx.drawImage(results.image, 0, 0, targetWidth, targetHeight);
              
              // Use destination-in to apply the mask (keeps only where mask is white)
              tempCtx.globalCompositeOperation = 'destination-in';
              tempCtx.drawImage(results.segmentationMask, 0, 0, targetWidth, targetHeight);
              
              // Reset composite operation for main canvas
              ctx.globalCompositeOperation = 'source-over';
              ctx.drawImage(tempCanvas, 0, 0, targetWidth, targetHeight);
            }
          } else if (backgroundImageRef.current) {
            console.log('Drawing background:', selectedBackground);
            console.log('Background image loaded:', backgroundImageRef.current.complete);
            
            // First draw the background
            ctx.drawImage(backgroundImageRef.current, 0, 0, targetWidth, targetHeight);
            
            // Create a temporary canvas for the person
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = targetWidth;
            tempCanvas.height = targetHeight;
            const tempCtx = tempCanvas.getContext('2d');
            
            if (tempCtx) {
              // Clear temp canvas first
              tempCtx.clearRect(0, 0, targetWidth, targetHeight);
              
              // Draw the person image on temp canvas
              tempCtx.drawImage(results.image, 0, 0, targetWidth, targetHeight);
              
              // Use destination-in to apply the mask (keeps only where mask is white)
              tempCtx.globalCompositeOperation = 'destination-in';
              tempCtx.drawImage(results.segmentationMask, 0, 0, targetWidth, targetHeight);
              
              // Reset composite operation for main canvas
              ctx.globalCompositeOperation = 'source-over';
              ctx.drawImage(tempCanvas, 0, 0, targetWidth, targetHeight);
            }
          }
        } else {
          // Just draw the person without background
          ctx.drawImage(results.image, 0, 0, targetWidth, targetHeight);
        }

        // Restore transformation if flip was applied
        if (isFlipped) {
          ctx.restore();
        }
      });

      selfieSegmentationRef.current = selfieSegmentation;

      const camera = new Camera(videoRef.current, {
        onFrame: async () => {
          if (selfieSegmentationRef.current) {
            await selfieSegmentationRef.current.send({ image: videoRef.current! });
          }
        },
        width: 1280,
        height: 720
      });

      cameraRef.current = camera;
      setIsInitialized(true);
      } catch (error) {
        console.error('Error initializing MediaPipe:', error);
      }
    }, [selectedBackground, isFlipped]);

  const startCamera = useCallback(async () => {
    if (!isInitialized || !cameraRef.current) return;

    try {
      // Get user media with high quality constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          frameRate: { ideal: 30, min: 15 },
          facingMode: 'user'
        },
        audio: false
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      await cameraRef.current.start();
      setIsCameraOn(true);
    } catch (error) {
      console.error('Error starting camera:', error);
    }
  }, [isInitialized]);

  const stopCamera = useCallback(() => {
    if (cameraRef.current) {
      cameraRef.current.stop();
    }
    
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    
    setIsCameraOn(false);
  }, []);

  const capturePhoto = useCallback(() => {
    if (!originalImageRef.current) {
      console.log('No original image available for capture');
      return;
    }

    // Create a download link for the original image
    const link = document.createElement('a');
    link.download = `photo_${new Date().getTime()}.png`;
    link.href = originalImageRef.current.toDataURL('image/png');
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    console.log('Photo captured and downloaded');
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!canvasRef.current) return;

    try {
      if (!document.fullscreenElement) {
        // Enter fullscreen
        await canvasRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        // Exit fullscreen
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (error) {
      console.error('Error toggling fullscreen:', error);
    }
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    initializeMediaPipe();
  }, [initializeMediaPipe]);

  // Load background image when selectedBackground changes
  useEffect(() => {
    console.log('Background changed to:', selectedBackground);
    if (selectedBackground && selectedBackground !== 'none' && selectedBackground !== 'blur') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        console.log('Background image loaded successfully:', img.src);
        console.log('Image dimensions:', img.width, 'x', img.height);
        backgroundImageRef.current = img;
      };
      img.onerror = () => {
        console.error('Failed to load background image:', selectedBackground);
        backgroundImageRef.current = null;
      };
      img.src = selectedBackground;
    } else {
      console.log('No background selected or blur mode');
      backgroundImageRef.current = null;
    }
  }, [selectedBackground]);

  useEffect(() => {
    return () => {
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
    };
  }, []);

  return (
    <div className="background-remover">
      <div className="video-container">
        <video
          ref={videoRef}
          className="video-input"
          style={{ display: 'none' }}
          playsInline
          muted
          autoPlay
        />
        <canvas
          ref={canvasRef}
          className="video-output"
          style={{
            width: '100%',
            height: '100%',
            border: '2px solid #333',
            borderRadius: '8px'
          }}
        />
        
        {/* Fullscreen Button */}
        <button
          onClick={toggleFullscreen}
          className="fullscreen-btn"
          disabled={!isCameraOn}
          title={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
        >
          {isFullscreen ? '⤓' : '⤢'}
        </button>
      </div>
      
      <div className="controls">
        <button
          onClick={isCameraOn ? stopCamera : startCamera}
          className={`camera-btn ${isCameraOn ? 'stop' : 'start'}`}
          disabled={!isInitialized}
        >
          {isCameraOn ? 'Tắt Camera' : 'Bật Camera'}
        </button>
        
        <button
          onClick={capturePhoto}
          className="capture-btn"
          disabled={!isCameraOn}
        >
          📸 Chụp Ảnh
        </button>
      </div>
      
      {/* Distance Indicator */}
      {isCameraOn && (
        <div className="distance-indicator">
          <div className="distance-status">
            <span className="distance-value">{distance.toFixed(1)}m</span>
            <span className={`distance-status-text ${isInRange ? 'in-range' : 'out-of-range'}`}>
              {isInRange ? '✅ Trong tầm' : '❌ Quá xa'}
            </span>
          </div>
          <div className="distance-hint">
            {selectedBackground && selectedBackground !== 'none' 
              ? (isInRange 
                  ? `✅ Background "${selectedBackground === 'blur' ? 'Xóa phông' : 'đã chọn'}" đang hoạt động` 
                  : '❌ Di chuyển gần hơn (≤1m) để kích hoạt background')
              : 'Chọn background để kích hoạt tính năng khoảng cách'
            }
          </div>
        </div>
      )}
    </div>
  );
};

export default BackgroundRemover;
