import React, { useRef, useEffect, useState, useCallback } from 'react';
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation';
import { Camera } from '@mediapipe/camera_utils';

interface BackgroundRemoverProps {
  selectedBackground: string;
  onBackgroundChange: (background: string) => void;
  onPoseSimilarity?: (similarity: number) => void;
  referencePose?: any;
}

const BackgroundRemover: React.FC<BackgroundRemoverProps> = ({ 
  selectedBackground, 
  onBackgroundChange: _onBackgroundChange,
  onPoseSimilarity,
  referencePose
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isFlipped] = useState(false); // No flip: live view and photos match real orientation
  const [distance, setDistance] = useState<number>(0);
  const [isInRange, setIsInRange] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [poseSimilarity, setPoseSimilarity] = useState<number>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [readyToCapture, setReadyToCapture] = useState(false);
  // Live refs to avoid stale state inside MediaPipe callback
  const countdownRef = useRef<number | null>(null);
  const isCapturingRef = useRef<boolean>(false);
  const readyToCaptureRef = useRef<boolean>(false);
  const cooldownActiveRef = useRef<boolean>(false);
  const cooldownTimeoutRef = useRef<number | null>(null);
  const isAutoCaptureRef = useRef<boolean>(false);
  const previousDistanceRef = useRef<number>(0);
  const selfieSegmentationRef = useRef<SelfieSegmentation | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const backgroundImageRef = useRef<HTMLImageElement | null>(null);
  const originalImageRef = useRef<HTMLCanvasElement | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const capturePhotoRef = useRef<() => void>(() => {});

  // Sync state to refs
  useEffect(() => { countdownRef.current = countdown; }, [countdown]);
  useEffect(() => { isCapturingRef.current = isCapturing; }, [isCapturing]);
  useEffect(() => { readyToCaptureRef.current = readyToCapture; }, [readyToCapture]);

  // Start countdown
  const startCountdown = useCallback((auto: boolean) => {
    if (isCapturingRef.current) {
      console.log('Countdown already in progress, skipping...');
      return; // Prevent multiple countdowns
    }
    
    console.log('🚀 Starting countdown!');
    setIsCapturing(true); isCapturingRef.current = true;
    setCountdown(3); countdownRef.current = 3;
    isAutoCaptureRef.current = auto;
    
    let currentCount = 3;
    countdownIntervalRef.current = setInterval(() => {
      currentCount--;
      console.log('Countdown tick:', currentCount);
      
      if (currentCount <= 0) {
        // Countdown finished, enable capture button
        console.log('Countdown finished!');
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        setIsCapturing(false); isCapturingRef.current = false;
        setCountdown(null); countdownRef.current = null;
        if (isAutoCaptureRef.current) {
          // Auto capture: start cooldown immediately, then capture
          setReadyToCapture(false); readyToCaptureRef.current = false;
          console.log('🤖 Auto capturing after countdown');
          
          // Start cooldown immediately
          cooldownActiveRef.current = true;
          if (cooldownTimeoutRef.current) window.clearTimeout(cooldownTimeoutRef.current);
          cooldownTimeoutRef.current = window.setTimeout(() => {
            cooldownActiveRef.current = false;
            isAutoCaptureRef.current = false;
            console.log('🟢 Auto-capture cooldown ended');
          }, 3000);
          
          // Trigger the same capture flow as manual button
          // Delay a tick to ensure overlay clears
          setTimeout(() => {
            try { capturePhotoRef.current(); } catch (e) { console.error(e); }
          }, 0);
        } else {
          // Manual flow: just enable the button
          setReadyToCapture(true); readyToCaptureRef.current = true;
        }
      } else {
        setCountdown(currentCount); countdownRef.current = currentCount;
      }
    }, 1000);
  }, []);

  // Cleanup countdown interval on unmount
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  // Simple pose analysis based on body proportions and position
  const analyzePose = useCallback((segmentationMask: any, imageWidth: number, imageHeight: number) => {
    try {
      // Create a temporary canvas to analyze the mask
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = imageWidth;
      tempCanvas.height = imageHeight;
      const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D | null;
      
      if (!tempCtx) return null;
      
      // Draw the segmentation mask
      tempCtx.drawImage(segmentationMask, 0, 0, imageWidth, imageHeight);
      
      // Get image data to analyze body shape
      const imageData = tempCtx.getImageData(0, 0, imageWidth, imageHeight);
      const data = imageData.data;
      
      let minX = imageWidth, maxX = 0, minY = imageHeight, maxY = 0;
      let personPixels = 0;
      
      // Find bounding box and count person pixels
      for (let y = 0; y < imageHeight; y++) {
        for (let x = 0; x < imageWidth; x++) {
          const index = (y * imageWidth + x) * 4;
          const alpha = data[index + 3];
          
          if (alpha > 128) { // Person pixel
            personPixels++;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      }
      
      if (personPixels === 0) return null;
      
      // Calculate body proportions
      const bodyWidth = maxX - minX;
      const bodyHeight = maxY - minY;
      const aspectRatio = bodyHeight / bodyWidth;
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const relativeCenterX = centerX / imageWidth;
      const relativeCenterY = centerY / imageHeight;
      
      // Calculate body area ratio
      const bodyArea = bodyWidth * bodyHeight;
      const totalArea = imageWidth * imageHeight;
      const areaRatio = bodyArea / totalArea;
      
      return {
        aspectRatio,
        relativeCenterX,
        relativeCenterY,
        areaRatio,
        bodyWidth,
        bodyHeight,
        centerX,
        centerY
      };
    } catch (error) {
      console.error('Error analyzing pose:', error);
      return null;
    }
  }, []);

  // Calculate pose similarity based on body analysis
  const calculatePoseSimilarity = useCallback((currentAnalysis: any, referenceAnalysis: any) => {
    if (!currentAnalysis || !referenceAnalysis) {
      return 0;
    }

    // Compare different aspects of the pose
    const aspectRatioDiff = Math.abs(currentAnalysis.aspectRatio - referenceAnalysis.aspectRatio);
    const centerXDiff = Math.abs(currentAnalysis.relativeCenterX - referenceAnalysis.relativeCenterX);
    const centerYDiff = Math.abs(currentAnalysis.relativeCenterY - referenceAnalysis.relativeCenterY);
    const areaRatioDiff = Math.abs(currentAnalysis.areaRatio - referenceAnalysis.areaRatio);

    // Normalize differences (stricter thresholds)
    const aspectRatioSimilarity = Math.max(0, 1 - aspectRatioDiff / 1.5); // Allow 1.5x difference
    const centerXSimilarity = Math.max(0, 1 - centerXDiff / 0.25); // Allow 25% difference
    const centerYSimilarity = Math.max(0, 1 - centerYDiff / 0.25); // Allow 25% difference
    const areaRatioSimilarity = Math.max(0, 1 - areaRatioDiff / 0.3); // Allow 30% difference

    // Weighted average of similarities (stricter)
    const similarity = (
      aspectRatioSimilarity * 0.3 +
      centerXSimilarity * 0.3 +
      centerYSimilarity * 0.3 +
      areaRatioSimilarity * 0.1
    );

    // No boost factor - use raw similarity for accuracy
    const finalSimilarity = similarity;

    console.log('Pose Analysis:', {
      current: currentAnalysis,
      reference: referenceAnalysis,
      similarities: {
        aspectRatio: aspectRatioSimilarity,
        centerX: centerXSimilarity,
        centerY: centerYSimilarity,
        areaRatio: areaRatioSimilarity
      },
      finalSimilarity: finalSimilarity
    });

    return Math.max(0, Math.min(1, finalSimilarity));
  }, []);

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
      
      // Debug logging (disabled)
      // console.log(`Person pixels: ${personPixels}, Total pixels: ${totalPixels}, Ratio: ${personRatio.toFixed(4)}`);
      // console.log(`Bounding box: ${boundingBoxArea}, Bounding ratio: ${boundingBoxRatio.toFixed(4)}`);
      
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
      
      // console.log(`Effective ratio: ${effectiveRatio.toFixed(4)}, Estimated distance: ${estimatedDistance}m`);
      return estimatedDistance;
    } catch (error) {
      console.error('Error estimating distance:', error);
      return 0;
    }
  }, []);

  const initializeMediaPipe = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    try {
      // Initialize Selfie Segmentation
      const selfieSegmentation = new SelfieSegmentation({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
        }
      });

      selfieSegmentation.setOptions({
        modelSelection: 1, // 0 for general, 1 for landscape
        selfieMode: true,
      });

      // Store references
      selfieSegmentationRef.current = selfieSegmentation;
      
      console.log('🎯 MediaPipe initialized, referencePose:', referencePose);

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

        // Base draw to avoid black screen even if later effects fail
        try {
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(results.image, 0, 0, targetWidth, targetHeight);
        } catch (e) {
          console.warn('Base draw failed:', e);
        }

        // No flip: draw as-is so live matches real-world orientation

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
          console.log('📸 Original image saved for capture');
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

        // Process pose analysis if reference pose is available
        if (referencePose) {
          const currentAnalysis = analyzePose(results.segmentationMask, targetWidth, targetHeight);
          if (currentAnalysis) {
            const similarity = calculatePoseSimilarity(currentAnalysis, referencePose);
            setPoseSimilarity(similarity);
            
            if (onPoseSimilarity) {
              onPoseSimilarity(similarity);
            }

            // Start countdown when similarity reaches 80% AND in range AND not in cooldown (auto)
            console.log('🔍 Checking countdown conditions:', {
              similarity: (similarity * 100).toFixed(1) + '%',
              distance: smoothedDistance.toFixed(1) + 'm',
              inRange: inRange,
              isCapturing: isCapturingRef.current,
              countdown: countdownRef.current,
              readyToCapture: readyToCaptureRef.current,
              cooldownActive: cooldownActiveRef.current,
              shouldTrigger: similarity >= 0.8 && inRange && !isCapturingRef.current && !readyToCaptureRef.current && !cooldownActiveRef.current
            });
            
            // Only start countdown if NOT in cooldown period
            if (similarity >= 0.8 && inRange && !isCapturingRef.current && !readyToCaptureRef.current && !cooldownActiveRef.current) {
              console.log('📸 POSE MATCHED 80% AND IN RANGE! Starting countdown...');
              startCountdown(true);
            } else if (cooldownActiveRef.current) {
              console.log('⏳ In cooldown period, ignoring pose match');
            } else if ((similarity < 0.75 || !inRange) && (isCapturingRef.current || readyToCaptureRef.current)) {
              // Reset if pose similarity drops below 60%
              console.log('🔄 Pose similarity dropped, resetting...');
              if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
                countdownIntervalRef.current = null;
              }
              setIsCapturing(false); isCapturingRef.current = false;
              setCountdown(null); countdownRef.current = null;
              setReadyToCapture(false); readyToCaptureRef.current = false;
            }
          }
        }
        
        // Debug logging (disabled)
        // console.log(`Raw: ${rawDistance.toFixed(2)}m, Smoothed: ${smoothedDistance.toFixed(2)}m, In Range: ${inRange}, Background: ${selectedBackground}`);

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

        // Draw countdown overlay if active (force on top)
        if (countdownRef.current !== null) {
          const displayCount = countdownRef.current;
          console.log('🎯 Drawing countdown on canvas:', displayCount);
          
          // Ensure normal paint mode
          ctx.globalCompositeOperation = 'source-over';
          
          // Dim background
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.fillRect(0, 0, targetWidth, targetHeight);

          // Backdrop circle behind number to increase contrast
          const cx = targetWidth / 2;
          const cy = targetHeight / 2;
          const r = Math.min(targetWidth, targetHeight) * 0.18;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.fill();

          // Countdown text with strong outline and shadow
          ctx.font = `bold ${Math.floor(Math.min(targetWidth, targetHeight) * 0.18)}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          ctx.lineJoin = 'round';
          ctx.miterLimit = 2;
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 12;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          
          ctx.strokeStyle = 'rgba(0,0,0,0.9)';
          ctx.lineWidth = 10;
          ctx.strokeText(displayCount!.toString(), cx, cy);
          
          ctx.fillStyle = '#ffffff';
          ctx.fillText(displayCount!.toString(), cx, cy);
          
          // Reset shadow for subsequent draws
          ctx.shadowBlur = 0;
        }

        // No flip restore needed
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
    }, [selectedBackground, isFlipped, referencePose]);

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
    console.log('📸 Capture photo triggered!');
    
    if (!originalImageRef.current) {
      console.log('❌ No original image available for capture');
      return;
    }

    try {
      // Create a download link for the original image
      const link = document.createElement('a');
      link.download = `photo_${new Date().getTime()}.png`;
      link.href = originalImageRef.current.toDataURL('image/png');
      
      console.log('📸 Download link created:', link.href.substring(0, 50) + '...');
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Reset states after capture
      setReadyToCapture(false);
      
      console.log('✅ Photo captured and downloaded successfully!');
    } catch (error) {
      console.error('❌ Error capturing photo:', error);
    }
  }, []);

  // Keep a stable ref to the capture function to avoid TDZ in callbacks
  useEffect(() => {
    capturePhotoRef.current = capturePhoto;
  }, [capturePhoto]);

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

  // Re-initialize pose detection when referencePose changes
  useEffect(() => {
    console.log('🔄 Reference pose changed:', referencePose);
    if (referencePose) {
      console.log('✅ Reference pose is now available for comparison');
    }
  }, [referencePose]);

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
          className={`capture-btn ${readyToCapture ? 'ready' : ''}`}
          disabled={!isCameraOn || isCapturing}
        >
          {readyToCapture ? '📸 CHỤP NGAY!' : '📸 Chụp Ảnh'}
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

      {/* Pose Similarity Indicator */}
      {isCameraOn && referencePose && (
        <div className="pose-similarity-indicator">
          <div className="pose-status">
            <span className="pose-value">{(poseSimilarity * 100).toFixed(0)}%</span>
            <span className={`pose-status-text ${poseSimilarity >= 0.8 ? 'match' : 'no-match'}`}>
              {isCapturing 
                ? '📸 Đang đếm ngược...' 
                : readyToCapture
                  ? '✅ Sẵn sàng chụp!'
                  : poseSimilarity >= 0.8 
                    ? '🎯 Khớp tư thế!' 
                    : '📐 Điều chỉnh tư thế'
              }
            </span>
          </div>
          
          {countdown !== null && (
            <div className="countdown-display">
              <div className="countdown-number">{countdown}</div>
              <div className="countdown-text">Chuẩn bị chụp ảnh!</div>
            </div>
          )}
          
          {readyToCapture && (
            <div className="ready-to-capture">
              <div className="ready-text">🎯 Tư thế hoàn hảo!</div>
              <div className="ready-subtext">Bấm nút chụp ảnh bên dưới</div>
            </div>
          )}
          
          {/* Auto capture is now automatic, no button needed */}
          <div className="pose-hint">
            {isCapturing 
              ? 'Giữ nguyên tư thế!' 
              : readyToCapture
                ? 'Tư thế hoàn hảo! Bấm nút chụp ảnh'
                : isInRange
                  ? '📸 Sẽ tự động đếm ngược khi đạt 80% tương đồng'
                  : '❌ Di chuyển gần hơn (≤1m) để kích hoạt auto chụp'
            }
          </div>
        </div>
      )}
    </div>
  );
};

export default BackgroundRemover;
