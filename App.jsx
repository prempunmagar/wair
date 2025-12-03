import React, { useState, useEffect, useRef, Component, createContext, useContext, useCallback } from 'react';
import {
  Camera,
  Upload,
  Shirt,
  MessageSquare,
  User,
  Plus,
  X,
  Check,
  Send,
  Sparkles,
  Search,
  ArrowLeft,
  Loader2,
  Trash2,
  Image as ImageIcon,
  MoreHorizontal,
  Settings,
  Download,
  AlertCircle,
  ChevronRight,
  PlusCircle,
  History,
  PieChart,
  ShoppingBag,
  Shuffle,
  WifiOff,
  RefreshCw,
  Eye
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  signInWithCustomToken
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
  writeBatch,
  limit
} from 'firebase/firestore';

// --- Firebase Initialization ---
const firebaseConfig = typeof __firebase_config !== 'undefined'
  ? JSON.parse(__firebase_config)
  : {
      apiKey: import.meta.env?.VITE_FIREBASE_API_KEY || '',
      authDomain: import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || '',
      projectId: import.meta.env?.VITE_FIREBASE_PROJECT_ID || '',
      storageBucket: import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET || '',
      messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      appId: import.meta.env?.VITE_FIREBASE_APP_ID || ''
    };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : (import.meta.env?.VITE_FIREBASE_APP_ID || 'default-app-id');

// --- API Key Configuration ---
const getApiKey = () => {
  // Vite environment variable (VITE_ prefix required)
  if (import.meta.env?.VITE_GEMINI_API_KEY) {
    return import.meta.env.VITE_GEMINI_API_KEY;
  }
  // Fallback for canvas/iframe environments
  if (typeof __gemini_api_key !== 'undefined' && __gemini_api_key) {
    return __gemini_api_key;
  }
  return null;
};

// --- Error Boundary Component ---
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
          <AlertCircle size={48} className="text-red-400 mb-4" />
          <h2 className="text-lg font-medium text-zinc-900 mb-2">Something went wrong</h2>
          <p className="text-sm text-zinc-500 mb-4">{this.state.error?.message || 'An unexpected error occurred'}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-zinc-900 text-white rounded-xl text-sm"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Online Status Context ---
const OnlineContext = createContext(true);

const OnlineProvider = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <OnlineContext.Provider value={isOnline}>
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 bg-amber-500 text-white text-xs py-2 px-4 flex items-center justify-center gap-2 z-50">
          <WifiOff size={14} />
          You're offline. Some features may be limited.
        </div>
      )}
      {children}
    </OnlineContext.Provider>
  );
};

// --- Utilities ---

const resizeImage = (base64Str, maxWidth = 800) => {
  return new Promise((resolve) => {
    let img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = base64Str;
    img.onload = () => {
      let canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height *= maxWidth / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      let ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve(base64Str);
  });
};

// Convert any image (URL or path) to base64
const imageToBase64 = async (imageSrc) => {
  // Already base64
  if (imageSrc.startsWith('data:')) {
    return imageSrc;
  }

  try {
    // For local paths, fetch the image as blob first
    const response = await fetch(imageSrc);
    if (!response.ok) {
      throw new Error('Failed to fetch image');
    }

    const blob = await response.blob();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.readAsDataURL(blob);
    });
  } catch (fetchError) {
    // Fallback: try loading via Image element (for external URLs)
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        try {
          const base64 = canvas.toDataURL('image/jpeg', 0.9);
          resolve(base64);
        } catch (e) {
          reject(new Error('Failed to convert image to base64'));
        }
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageSrc;
    });
  }
};

// Image component with loading state
const LazyImage = ({ src, alt, className, fallback = null }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  return (
    <div className={`relative ${className}`}>
      {loading && !error && (
        <div className="absolute inset-0 bg-zinc-100 animate-pulse flex items-center justify-center">
          <ImageIcon size={24} className="text-zinc-300" />
        </div>
      )}
      {error ? (
        fallback || (
          <div className="absolute inset-0 bg-zinc-100 flex items-center justify-center">
            <ImageIcon size={24} className="text-zinc-300" />
          </div>
        )
      ) : (
        <img
          src={src}
          alt={alt}
          className={`${className} ${loading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
          onLoad={() => setLoading(false)}
          onError={() => { setLoading(false); setError(true); }}
        />
      )}
    </div>
  );
};

// --- Default Data ---

const generateDemoWardrobe = () => {
  const items = [
    // --- TOPS (6) ---
    { c: 'Top', s: 'White Blouse', col: 'White', mat: 'Cotton', img: '/images/wardrobe/tops/01-white-blouse.jpg' },
    { c: 'Top', s: 'Black T-Shirt', col: 'Black', mat: 'Cotton', img: '/images/wardrobe/tops/02-black-top.jpg' },
    { c: 'Top', s: 'Striped Shirt', col: 'Blue/White', mat: 'Cotton', img: '/images/wardrobe/tops/03-striped-shirt.jpg' },
    { c: 'Top', s: 'Knit Sweater', col: 'Cream', mat: 'Wool', img: '/images/wardrobe/tops/04-sweater.jpg' },
    { c: 'Top', s: 'Tank Top', col: 'White', mat: 'Cotton', img: '/images/wardrobe/tops/05-tank-top.jpg' },
    { c: 'Top', s: 'Silk Blouse', col: 'Pink', mat: 'Silk', img: '/images/wardrobe/tops/06-blouse.jpg' },

    // --- BOTTOMS (5) ---
    { c: 'Bottom', s: 'Blue Jeans', col: 'Blue', mat: 'Denim', img: '/images/wardrobe/bottoms/01-blue-jeans.jpg' },
    { c: 'Bottom', s: 'Black Pants', col: 'Black', mat: 'Cotton', img: '/images/wardrobe/bottoms/02-black-pants.jpg' },
    { c: 'Bottom', s: 'Midi Skirt', col: 'Brown', mat: 'Polyester', img: '/images/wardrobe/bottoms/03-skirt.jpg' },
    { c: 'Bottom', s: 'Denim Shorts', col: 'Light Blue', mat: 'Denim', img: '/images/wardrobe/bottoms/04-shorts.jpg' },
    { c: 'Bottom', s: 'Tailored Trousers', col: 'Beige', mat: 'Wool Blend', img: '/images/wardrobe/bottoms/05-trousers.jpg' },

    // --- DRESSES (4) ---
    { c: 'Dress', s: 'Red Gown', col: 'Red', mat: 'Satin', img: '/images/wardrobe/dresses/01-black-dress.jpg' },
    { c: 'Dress', s: 'Floral Dress', col: 'Multi', mat: 'Cotton', img: '/images/wardrobe/dresses/02-floral-dress.jpg' },
    { c: 'Dress', s: 'Summer Dress', col: 'Yellow', mat: 'Linen', img: '/images/wardrobe/dresses/03-summer-dress.jpg' },
    { c: 'Dress', s: 'Evening Dress', col: 'Navy', mat: 'Silk', img: '/images/wardrobe/dresses/04-evening-dress.jpg' },

    // --- OUTERWEAR (4) ---
    { c: 'Outerwear', s: 'Blazer', col: 'Grey', mat: 'Wool', img: '/images/wardrobe/outerwear/01-blazer.jpg' },
    { c: 'Outerwear', s: 'Leather Jacket', col: 'Black', mat: 'Leather', img: '/images/wardrobe/outerwear/02-leather-jacket.jpg' },
    { c: 'Outerwear', s: 'Denim Jacket', col: 'Blue', mat: 'Denim', img: '/images/wardrobe/outerwear/03-denim-jacket.jpg' },
    { c: 'Outerwear', s: 'Wool Coat', col: 'Camel', mat: 'Wool', img: '/images/wardrobe/outerwear/04-coat.jpg' },

    // --- SHOES (4) ---
    { c: 'Shoes', s: 'Sneakers', col: 'Red', mat: 'Mesh', img: '/images/wardrobe/shoes/01-sneakers.jpg' },
    { c: 'Shoes', s: 'Heels', col: 'Black', mat: 'Patent Leather', img: '/images/wardrobe/shoes/02-heels.jpg' },
    { c: 'Shoes', s: 'Ankle Boots', col: 'Brown', mat: 'Leather', img: '/images/wardrobe/shoes/03-boots.jpg' },
    { c: 'Shoes', s: 'Sandals', col: 'Tan', mat: 'Leather', img: '/images/wardrobe/shoes/04-sandals.jpg' },

    // --- ACCESSORIES (4) ---
    { c: 'Accessory', s: 'Handbag', col: 'Red', mat: 'Leather', img: '/images/wardrobe/accessories/01-handbag.jpg' },
    { c: 'Accessory', s: 'Sunglasses', col: 'Black', mat: 'Plastic', img: '/images/wardrobe/accessories/02-sunglasses.jpg' },
    { c: 'Accessory', s: 'Watch', col: 'Silver', mat: 'Stainless Steel', img: '/images/wardrobe/accessories/03-watch.jpg' },
    { c: 'Accessory', s: 'Scarf', col: 'Multi', mat: 'Cashmere', img: '/images/wardrobe/accessories/04-scarf.jpg' },
  ];

  return items.map(item => ({
    category: item.c,
    subcategory: item.s,
    color: item.col,
    material: item.mat,
    formality: Math.floor(Math.random() * 9) + 1,
    image: item.img,
    description: `A stylish ${item.col} ${item.s} made of ${item.mat}`,
    // Create a searchable key for better matching
    searchKey: `${item.col} ${item.s} ${item.c}`.toLowerCase(),
    createdAt: serverTimestamp()
  }));
};

const DEMO_GALLERY_IMAGES = [
  '/images/models/model-01.jpg',
  '/images/models/model-02.jpg',
  '/images/models/model-03.jpg',
  '/images/models/model-04.jpg',
  '/images/models/model-05.jpg',
];

// --- API Handling ---
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_IMAGE_MODEL = "gemini-2.0-flash-exp-image-generation"; // For image generation

// API Error class for better error handling
class ApiError extends Error {
  constructor(message, code = 'API_ERROR', retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

async function generateWithGemini(prompt, systemInstruction = "", imageBase64 = null, retries = 2) {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new ApiError('API key not configured. Please set REACT_APP_GEMINI_API_KEY or __gemini_api_key.', 'NO_API_KEY', false);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  // Combine system instruction with prompt for gemini-pro compatibility
  const fullPrompt = systemInstruction
    ? `${systemInstruction}\n\n${prompt}`
    : prompt;

  const parts = [{ text: fullPrompt }];

  if (imageBase64) {
    const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: cleanBase64
      }
    });
  }

  const payload = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192
    }
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || `HTTP ${response.status}`;

        if (response.status === 429 || response.status >= 500) {
          throw new ApiError(errorMsg, 'RATE_LIMIT', true);
        }
        throw new ApiError(errorMsg, 'API_ERROR', false);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        throw new ApiError('Empty response from AI', 'EMPTY_RESPONSE', true);
      }

      try {
        const cleanText = text.replace(/```json|```/g, '').trim();
        return JSON.parse(cleanText);
      } catch (e) {
        console.error("JSON Parse Error. Raw Text:", text);
        throw new ApiError("Failed to parse AI response", 'PARSE_ERROR', true);
      }
    } catch (error) {
      if (error instanceof ApiError && error.retryable && attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
}

async function generateMultimodalImage(prompt, referenceImages = [], retries = 1) {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new ApiError('API key not configured', 'NO_API_KEY', false);
  }

  // Use Gemini image generation model
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`;

  // Build parts array with text prompt and reference images
  const parts = [{ text: prompt }];

  // Add reference images if provided
  for (const imgBase64 of referenceImages) {
    if (imgBase64) {
      const cleanBase64 = imgBase64.includes(',') ? imgBase64.split(',')[1] : imgBase64;
      parts.push({
        inlineData: { mimeType: "image/jpeg", data: cleanBase64 }
      });
    }
  }

  const payload = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"]
    }
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error?.message || 'Image generation failed';
        throw new ApiError(errorMsg, 'IMAGE_GEN_ERROR', attempt < retries);
      }

      const result = await response.json();

      // Find the image in the response
      const imagePart = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData);

      if (!imagePart?.inlineData?.data) {
        throw new ApiError("No image generated", 'NO_IMAGE', attempt < retries);
      }

      const mimeType = imagePart.inlineData.mimeType || 'image/png';
      return `data:${mimeType};base64,${imagePart.inlineData.data}`;
    } catch (error) {
      if (error instanceof ApiError && error.retryable && attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
}

// --- Improved Item Matching ---

// Find wardrobe items using fuzzy matching on descriptions
const findWardrobeItems = (itemDescriptions, wardrobe) => {
  const results = [];

  for (const desc of itemDescriptions) {
    const descLower = desc.toLowerCase();

    // Try exact ID match first
    let match = wardrobe.find(w => w.id === desc);

    // Try searchKey match
    if (!match) {
      match = wardrobe.find(w => w.searchKey === descLower);
    }

    // Try partial match on subcategory + color
    if (!match) {
      match = wardrobe.find(w => {
        const itemDesc = `${w.color} ${w.subcategory}`.toLowerCase();
        return itemDesc.includes(descLower) || descLower.includes(itemDesc) ||
               descLower.includes(w.subcategory.toLowerCase()) ||
               (descLower.includes(w.color.toLowerCase()) && descLower.includes(w.category.toLowerCase()));
      });
    }

    // Try category + color match
    if (!match) {
      match = wardrobe.find(w =>
        descLower.includes(w.category.toLowerCase()) &&
        descLower.includes(w.color.toLowerCase())
      );
    }

    if (match && !results.includes(match)) {
      results.push(match);
    }
  }

  return results;
};


// --- Components ---

const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, icon: Icon }) => {
  const base = "px-4 py-3 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 active:scale-95";
  const variants = {
    primary: "bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-700",
    secondary: "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 disabled:bg-zinc-50",
    outline: "border border-zinc-200 text-zinc-900 hover:bg-zinc-50",
    danger: "bg-red-50 text-red-600 hover:bg-red-100"
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {Icon && <Icon size={18} />}
      {children}
    </button>
  );
};

// Toast notification component
const Toast = ({ message, type = 'error', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const colors = {
    error: 'bg-red-500',
    success: 'bg-green-500',
    warning: 'bg-amber-500'
  };

  return (
    <div className={`fixed bottom-24 left-4 right-4 ${colors[type]} text-white p-4 rounded-xl shadow-lg z-50 flex items-center gap-3 animate-in slide-in-from-bottom-4`}>
      <AlertCircle size={20} />
      <p className="text-sm flex-1">{message}</p>
      <button onClick={onClose}><X size={16} /></button>
    </div>
  );
};

// --- Modals ---

const WardrobeInsightsModal = ({ items, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const analyze = async () => {
      try {
        const context = items.map(i => `${i.color} ${i.subcategory} (${i.category})`).join(', ');
        const prompt = `Analyze this wardrobe inventory.
        Inventory: ${context}.
        Return JSON: {
          "style": "string (dominant style description, 2 sentences)",
          "palette": ["color1", "color2", "color3"],
          "missing": ["item1", "item2", "item3"] (3 specific items to complete this wardrobe)
        }`;
        const result = await generateWithGemini(prompt);
        setData(result);
      } catch (e) {
        console.error(e);
        setError(e.message || 'Analysis failed');
      } finally {
        setLoading(false);
      }
    };
    analyze();
  }, [items]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-6 animate-in slide-in-from-bottom-full duration-300">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-light flex items-center gap-2">
            <Sparkles className="text-amber-500" size={20} /> Wardrobe Insights
          </h2>
          <button onClick={onClose}><X size={24} /></button>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center text-zinc-400">
            <Loader2 className="animate-spin mb-4" size={32} />
            <p>Analyzing your closet...</p>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <AlertCircle size={32} className="text-red-400 mx-auto mb-4" />
            <p className="text-red-500 text-sm">{error}</p>
            <Button onClick={onClose} variant="outline" className="mt-4">Close</Button>
          </div>
        ) : data ? (
          <div className="space-y-6">
             <div className="bg-zinc-50 p-4 rounded-xl">
               <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Dominant Style</h3>
               <p className="text-sm text-zinc-800 leading-relaxed">{data.style}</p>
             </div>

             <div>
               <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Color Palette</h3>
               <div className="flex gap-2 flex-wrap">
                 {data.palette?.map((c, i) => (
                   <span key={i} className="px-3 py-1 bg-zinc-100 rounded-full text-xs font-medium text-zinc-600 border border-zinc-200">{c}</span>
                 ))}
               </div>
             </div>

             <div>
               <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2 flex items-center gap-2">
                 <ShoppingBag size={14} /> Missing Essentials
               </h3>
               <div className="grid grid-cols-1 gap-2">
                 {data.missing?.map((item, i) => (
                   <div key={i} className="flex items-center gap-3 p-3 border border-zinc-100 rounded-xl">
                     <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 font-bold text-xs">{i+1}</div>
                     <span className="text-sm font-medium">{item}</span>
                   </div>
                 ))}
               </div>
             </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

// --- Views ---

const AddItemView = ({ onSave, onCancel }) => {
  const [image, setImage] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    category: '',
    subcategory: '',
    color: '',
    material: '',
    formality: 5,
    description: ''
  });
  const fileInputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const resized = await resizeImage(reader.result);
      setImage(resized);
      analyzeImage(resized);
    };
    reader.readAsDataURL(file);
  };

  const analyzeImage = async (base64Img) => {
    setAnalyzing(true);
    setError(null);
    try {
      const prompt = `Analyze this clothing item. Return JSON: {
        "category": "Top"|"Bottom"|"Shoes"|"Outerwear"|"Accessory"|"Dress",
        "subcategory": "string (specific type like 'Denim Jacket', 'Sneakers', etc.)",
        "color": "string (main color)",
        "material": "string (fabric/material type)"
      }`;

      const result = await generateWithGemini(prompt, "", base64Img);
      setData(prev => ({
        ...prev,
        ...result,
        searchKey: `${result.color} ${result.subcategory} ${result.category}`.toLowerCase()
      }));
    } catch (err) {
      console.error("Analysis failed", err);
      setError(err.message || 'Failed to analyze image. Please fill in details manually.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = () => {
    if (!image || !data.category) return;
    const itemData = {
      ...data,
      image,
      searchKey: `${data.color} ${data.subcategory} ${data.category}`.toLowerCase(),
      createdAt: serverTimestamp()
    };
    onSave(itemData);
  };

  return (
    <div className="flex flex-col h-full bg-white p-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-light tracking-tight">Add New Item</h2>
        <button onClick={onCancel} className="p-2 hover:bg-zinc-100 rounded-full">
          <X size={24} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6">
        <div
          onClick={() => !image && fileInputRef.current?.click()}
          className={`aspect-[3/4] rounded-2xl flex flex-col items-center justify-center border-2 border-dashed transition-all relative overflow-hidden ${image ? 'border-transparent' : 'border-zinc-200 hover:border-zinc-400 cursor-pointer bg-zinc-50'}`}
        >
          {image ? (
            <>
              <img src={image} alt="Preview" className="w-full h-full object-cover" />
              <button
                onClick={(e) => { e.stopPropagation(); setImage(null); setData({category:'', subcategory:'', color:'', material:'', formality:5, description:''}); setError(null); }}
                className="absolute top-4 right-4 bg-white/90 p-2 rounded-full shadow-lg"
              >
                <Trash2 size={20} className="text-red-500" />
              </button>
            </>
          ) : (
            <div className="text-center p-6">
              <Camera size={32} className="text-zinc-400 mx-auto mb-4" />
              <p className="font-medium text-zinc-900">Upload Photo</p>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </div>

        {image && (
          <div className="space-y-4">
            {analyzing ? (
              <div className="flex items-center gap-3 p-4 bg-zinc-50 rounded-xl">
                <Loader2 className="animate-spin text-zinc-400" />
                <span className="text-zinc-600 text-sm">AI is analyzing your item...</span>
              </div>
            ) : (
              <>
                {error && (
                  <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl text-amber-700 text-sm">
                    <AlertCircle size={16} />
                    {error}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold uppercase text-zinc-400 mb-1 block">Category</label>
                    <select
                      value={data.category}
                      onChange={(e) => setData({...data, category: e.target.value})}
                      className="w-full p-3 bg-zinc-50 rounded-xl text-sm border-none focus:ring-2 focus:ring-zinc-900"
                    >
                      <option value="">Select...</option>
                      {['Top', 'Bottom', 'Shoes', 'Outerwear', 'Accessory', 'Dress'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase text-zinc-400 mb-1 block">Subcategory</label>
                    <input
                      type="text"
                      value={data.subcategory}
                      onChange={(e) => setData({...data, subcategory: e.target.value})}
                      placeholder="e.g., Denim Jacket"
                      className="w-full p-3 bg-zinc-50 rounded-xl text-sm border-none focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold uppercase text-zinc-400 mb-1 block">Color</label>
                    <input
                      type="text"
                      value={data.color}
                      onChange={(e) => setData({...data, color: e.target.value})}
                      placeholder="e.g., Navy Blue"
                      className="w-full p-3 bg-zinc-50 rounded-xl text-sm border-none focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase text-zinc-400 mb-1 block">Material</label>
                    <input
                      type="text"
                      value={data.material}
                      onChange={(e) => setData({...data, material: e.target.value})}
                      placeholder="e.g., Cotton"
                      className="w-full p-3 bg-zinc-50 rounded-xl text-sm border-none focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <div className="mt-6 pt-4 border-t border-zinc-100">
        <Button onClick={handleSave} disabled={!image || analyzing || !data.category} className="w-full">Add to Wardrobe</Button>
      </div>
    </div>
  );
};

const ProfileView = ({ profile, onUpdateProfile }) => {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const gallery = profile?.gallery || [];
  const attributes = profile?.attributes || { gender: 'Unknown', summary: 'No analysis yet.' };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const resized = await resizeImage(reader.result, 800);

      let newAttributes = { ...attributes };
      try {
        const prompt = `Analyze this person's appearance for a fashion app. Return JSON: {
          "gender": "Woman"|"Man"|"Non-Binary",
          "hair": "string (color and style)",
          "bodyType": "string (general build)",
          "skinTone": "string (general tone)"
        }`;
        const result = await generateWithGemini(prompt, "", resized);
        newAttributes = { ...result, summary: `${result.skinTone} skin, ${result.hair}, ${result.bodyType} build` };
      } catch (err) {
        console.error("Auto-analysis failed", err);
        setError('Photo added but analysis failed. You can still use it for try-on.');
      }

      const newGallery = [resized, ...gallery].slice(0, 10); // Limit to 10 photos
      onUpdateProfile({
        gallery: newGallery,
        attributes: newAttributes
      });
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const deletePhoto = (index) => {
    const newGallery = gallery.filter((_, i) => i !== index);
    onUpdateProfile({ ...profile, gallery: newGallery });
  };

  return (
    <div className="flex flex-col h-full bg-white p-6 animate-in fade-in duration-300">
      <h1 className="text-3xl font-light tracking-tight mb-2">My Gallery</h1>
      <p className="text-zinc-500 text-sm mb-6">Upload photos of yourself. The AI uses these for Virtual Try-On.</p>

      {error && (
        <div className="bg-amber-50 text-amber-700 p-3 rounded-xl text-sm mb-4 flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={16} className="text-amber-500" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900">AI Inferred Profile</h3>
        </div>
        <div className="grid grid-cols-2 gap-y-2 text-sm text-zinc-600">
           <div><span className="text-zinc-400 text-xs block">Gender</span> {attributes.gender}</div>
           <div><span className="text-zinc-400 text-xs block">Hair</span> {attributes.hair || '-'}</div>
           <div><span className="text-zinc-400 text-xs block">Skin Tone</span> {attributes.skinTone || '-'}</div>
           <div><span className="text-zinc-400 text-xs block">Body Type</span> {attributes.bodyType || '-'}</div>
        </div>
        <p className="text-[10px] text-zinc-400 mt-3 italic">Calculated automatically from your latest photo.</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="aspect-[3/4] rounded-2xl bg-zinc-100 border-2 border-dashed border-zinc-200 hover:border-zinc-400 flex flex-col items-center justify-center transition-all disabled:opacity-50"
          >
             {uploading ? <Loader2 className="animate-spin text-zinc-400" /> : <Plus size={32} className="text-zinc-400" />}
             <span className="text-xs text-zinc-500 mt-2">{uploading ? 'Analyzing...' : 'Add Photo'}</span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />

          {gallery.map((img, idx) => (
            <div key={idx} className="relative group aspect-[3/4] rounded-2xl overflow-hidden bg-zinc-100">
              <LazyImage src={img} alt={`Gallery ${idx}`} className="w-full h-full object-cover" />
              <button
                onClick={() => deletePhoto(idx)}
                className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={14} />
              </button>
              {idx === 0 && (
                <div className="absolute bottom-2 left-2 px-2 py-1 bg-amber-500 text-white text-[10px] rounded-full font-medium">
                  Primary
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const ChatListView = ({ chats, onSelectChat, onCreateChat, onDeleteChat }) => {
  return (
    <div className="flex flex-col h-full bg-white p-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-light tracking-tight">Styling Sessions</h1>
        <button onClick={onCreateChat} className="p-2 bg-zinc-900 text-white rounded-full hover:bg-zinc-800">
          <Plus size={24} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3">
        {chats.length === 0 ? (
          <div className="text-center text-zinc-400 mt-20">
            <MessageSquare size={48} className="mx-auto mb-4 opacity-20" />
            <p>No chats yet. Start a new session!</p>
          </div>
        ) : (
          chats.map(chat => (
            <div
              key={chat.id}
              className="relative group"
            >
              <button
                onClick={() => onSelectChat(chat.id)}
                className="w-full p-4 bg-zinc-50 hover:bg-zinc-100 rounded-xl text-left transition-colors"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-zinc-900 truncate pr-8">{chat.title || 'New Session'}</span>
                  <ChevronRight size={16} className="text-zinc-300 group-hover:text-zinc-500" />
                </div>
                <span className="text-xs text-zinc-400 line-clamp-1">{chat.lastMessage || 'No messages'}</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteChat(chat.id); }}
                className="absolute top-4 right-12 p-1.5 text-zinc-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const ChatDetailView = ({ chatId, onBack, user, wardrobe, profile, onTryOn }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [attachedImage, setAttachedImage] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);
  const isOnline = useContext(OnlineContext);

  const SUGGESTIONS = [
    "Date night look 💕",
    "Job interview outfit",
    "Casual brunch style",
    "Night out with friends"
  ];

  useEffect(() => {
    if (!user || !chatId) return;
    const q = query(
      collection(db, 'artifacts', appId, 'users', user.uid, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(q, (snap) => setMessages(snap.docs.map(d => ({id: d.id, ...d.data()}))));
  }, [user, chatId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isTyping]);

  // Build conversation history for context
  const buildConversationHistory = () => {
    return messages.slice(-10).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.text || (msg.outfits ? `Suggested outfits: ${msg.outfits.map(o => o.name).join(', ')}` : '')
    })).filter(m => m.content);
  };

  const handleSendMessage = async (text, img = null) => {
    if ((!text.trim() && !img) || !isOnline) {
      if (!isOnline) setError('You are offline. Please reconnect to send messages.');
      return;
    }

    setInput('');
    setAttachedImage(null);
    setError(null);

    // Save user message
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'chats', chatId, 'messages'), {
      text, image: img, role: 'user', createdAt: serverTimestamp()
    });

    if (messages.length === 0) {
      updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'chats', chatId), { title: text.substring(0, 30) });
    }
    updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'chats', chatId), { lastMessage: img ? 'Sent a photo' : text, updatedAt: serverTimestamp() });

    setIsTyping(true);
    try {
      // Build wardrobe context with better identifiers
      const wardrobeContext = wardrobe.map(i =>
        `- "${i.color} ${i.subcategory}" (Category: ${i.category}, ID: ${i.id})`
      ).join('\n');

      const profileContext = profile?.attributes ? JSON.stringify(profile.attributes) : "Unknown";
      const conversationHistory = buildConversationHistory();

      let systemPrompt = "";
      let fullPrompt = "";

      if (img) {
        systemPrompt = `You are WAIR, an expert fashion stylist AI. Analyze the user's uploaded outfit photo.`;
        fullPrompt = `Analyze this outfit photo. User's comment: "${text || 'Rate my outfit'}".

        Provide:
        1. Overall rating (1-10)
        2. 3 specific things that work well
        3. 1-2 constructive suggestions for improvement

        Return JSON: {
          "responseText": "string (formatted response with emoji and bullet points for readability)",
          "outfits": []
        }`;
      } else {
        // Group wardrobe items by category for better context
        const wardrobeByCategory = {};
        wardrobe.forEach(item => {
          if (!wardrobeByCategory[item.category]) wardrobeByCategory[item.category] = [];
          wardrobeByCategory[item.category].push(item);
        });

        const categorizedWardrobe = Object.entries(wardrobeByCategory)
          .map(([cat, items]) => `${cat}s:\n${items.map(i => `  - "${i.color} ${i.subcategory}" (Material: ${i.material || 'N/A'})`).join('\n')}`)
          .join('\n\n');

        systemPrompt = `You are WAIR, an expert fashion stylist AI with deep knowledge of:
- Color theory (complementary, analogous, monochromatic palettes)
- Occasion-appropriate dressing (casual, business, formal, date night, etc.)
- Body-flattering silhouettes and proportions
- Current fashion trends and timeless style principles
- Fabric combinations and seasonal appropriateness

Your goal is to create cohesive, stylish outfits that make users feel confident.`;

        fullPrompt = `USER PROFILE:
${profileContext}

WARDROBE INVENTORY:
${categorizedWardrobe}

CONVERSATION CONTEXT:
${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}

USER REQUEST: "${text}"

STYLING INSTRUCTIONS:
1. ONLY use items from the wardrobe above - use EXACT descriptions (e.g., "Blue Blue Jeans", "Black Leather Jacket")
2. Create complete outfits: top + bottom (or dress) + shoes + optional accessories
3. Apply color coordination:
   - Neutrals (black, white, grey, beige) pair with everything
   - Use the 3-color rule maximum
   - Consider complementary or analogous color schemes
4. Match formality levels across all pieces
5. Consider the occasion/context mentioned
6. Explain WHY items work together (color, style, occasion fit)

Create 2 outfit options with different vibes/styles when possible.

Return JSON:
{
  "responseText": "string (friendly greeting + brief style advice, use emoji sparingly)",
  "outfits": [
    {
      "name": "string (catchy outfit name like 'Casual Friday' or 'Weekend Brunch')",
      "occasion": "string (where to wear this)",
      "items": ["exact item description 1", "exact item description 2", "exact item description 3"],
      "reasoning": "string (explain color coordination, style balance, why it works)",
      "stylingTip": "string (one specific tip to elevate this look)"
    }
  ]
}`;
      }

      const aiResponse = await generateWithGemini(fullPrompt, systemPrompt, img);

      // Use improved matching function
      const enrichedOutfits = aiResponse.outfits?.map(o => ({
        ...o,
        items: findWardrobeItems(o.items || [], wardrobe)
      })).filter(o => o.items.length > 0) || [];

      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'chats', chatId, 'messages'), {
        text: aiResponse.responseText,
        outfits: enrichedOutfits.map(o => ({
          ...o,
          items: o.items.map(item => ({ id: item.id, ...item }))
        })),
        role: 'ai',
        createdAt: serverTimestamp()
      });
      updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'chats', chatId), {
        lastMessage: aiResponse.responseText?.substring(0, 50) + '...',
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to get response. Please try again.');

      // Save error message to chat
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'chats', chatId, 'messages'), {
        text: "I'm having trouble responding right now. Please try again in a moment.",
        role: 'ai',
        isError: true,
        createdAt: serverTimestamp()
      });
    } finally {
      setIsTyping(false);
    }
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = await resizeImage(reader.result);
        setAttachedImage(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSurpriseMe = () => {
    if (wardrobe.length === 0) return;
    const randomItem = wardrobe[Math.floor(Math.random() * wardrobe.length)];
    handleSendMessage(`Build a creative outfit around my ${randomItem.color} ${randomItem.subcategory}. Make it something unexpected!`);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50">
      <div className="px-4 py-4 bg-white border-b border-zinc-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack}><ArrowLeft size={24} className="text-zinc-600" /></button>
          <h2 className="font-medium">Chat</h2>
        </div>
        <button
          onClick={handleSurpriseMe}
          disabled={!isOnline || wardrobe.length === 0}
          className="text-xs font-medium text-amber-600 flex items-center gap-1 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-100 disabled:opacity-50"
        >
           <Shuffle size={12} /> Surprise Me
        </button>
      </div>

      {error && <Toast message={error} onClose={() => setError(null)} />}

      <div className="flex-1 overflow-y-auto p-4 space-y-6" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="mt-8">
            <p className="text-center text-zinc-400 text-sm mb-4">Quick Start Ideas:</p>
            <div className="grid grid-cols-2 gap-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => handleSendMessage(s)}
                  disabled={!isOnline}
                  className="p-3 bg-white border border-zinc-100 rounded-xl text-xs text-zinc-600 hover:border-zinc-300 hover:shadow-sm transition-all disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] space-y-2`}>
              {msg.image && (
                <div className="mb-2 rounded-2xl overflow-hidden border border-zinc-200">
                  <LazyImage src={msg.image} alt="User Upload" className="max-w-[200px] max-h-[200px] object-cover" />
                </div>
              )}
              {msg.text && (
                <div className={`p-4 rounded-2xl text-sm whitespace-pre-line ${
                  msg.role === 'user'
                    ? 'bg-zinc-900 text-white rounded-br-none'
                    : msg.isError
                      ? 'bg-red-50 text-red-700 border border-red-100 rounded-bl-none'
                      : 'bg-white shadow-sm border border-zinc-100 rounded-bl-none'
                }`}>
                  {msg.text}
                </div>
              )}

              {msg.outfits?.map((outfit, idx) => (
                <div key={idx} className="bg-white p-4 rounded-2xl shadow-sm border border-zinc-100">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-bold text-sm">{outfit.name}</h3>
                    {outfit.occasion && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{outfit.occasion}</span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mb-3">{outfit.reasoning}</p>
                  <div className="flex gap-2 mb-3 overflow-x-auto no-scrollbar pb-1">
                    {outfit.items.map((item, i) => (
                      <div key={i} className="flex-shrink-0 relative">
                        <LazyImage
                          src={item.image}
                          className="w-16 h-20 rounded-lg object-cover bg-zinc-100"
                          alt={item.subcategory}
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] text-center py-0.5 rounded-b-lg truncate px-1">
                          {item.subcategory}
                        </div>
                      </div>
                    ))}
                  </div>
                  {outfit.stylingTip && (
                    <div className="bg-zinc-50 rounded-lg p-2 mb-3 flex items-start gap-2">
                      <Sparkles size={12} className="text-amber-500 mt-0.5 flex-shrink-0" />
                      <p className="text-[11px] text-zinc-600">{outfit.stylingTip}</p>
                    </div>
                  )}
                  {outfit.items.length > 0 && (
                    <Button
                      onClick={() => onTryOn(outfit)}
                      variant="secondary"
                      className="w-full text-xs h-8"
                      icon={Sparkles}
                    >
                      Virtual Try-On
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex items-center gap-2 text-xs text-zinc-400 ml-4">
            <Loader2 className="animate-spin" size={14} />
            WAIR is thinking...
          </div>
        )}
      </div>

      <div className="p-4 bg-white border-t border-zinc-100">
        {attachedImage && (
          <div className="mb-2 relative inline-block">
             <img src={attachedImage} className="w-16 h-16 rounded-lg object-cover border border-zinc-200" alt="Attached" />
             <button onClick={() => setAttachedImage(null)} className="absolute -top-2 -right-2 bg-black text-white rounded-full p-1"><X size={10} /></button>
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(input, attachedImage); }} className="flex gap-2 items-end">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!isOnline}
            className="p-3 bg-zinc-100 text-zinc-500 rounded-xl hover:bg-zinc-200 disabled:opacity-50"
          >
             <Camera size={20} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={attachedImage ? "Add a comment (optional)..." : "Type a message..."}
            disabled={!isOnline}
            className="flex-1 bg-zinc-100 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-zinc-900 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={(!input && !attachedImage) || !isOnline}
            className="p-3 bg-zinc-900 text-white rounded-xl disabled:opacity-50"
          >
            <Send size={20} />
          </button>
        </form>
      </div>
    </div>
  );
};

const TryOnModal = ({ outfit, profile, onClose }) => {
  const [selectedPhoto, setSelectedPhoto] = useState(profile?.gallery?.[0] || null);
  const [generatedImage, setGeneratedImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerate = async () => {
    if (!selectedPhoto) return;
    setLoading(true);
    setError(null);
    setGeneratedImage(null);

    try {
      // Convert the selected photo to base64
      const photoBase64 = await imageToBase64(selectedPhoto);

      // Convert outfit item images to base64
      const outfitImagesBase64 = [];
      for (const item of outfit.items.slice(0, 3)) {
        if (item.image) {
          const itemBase64 = await imageToBase64(item.image);
          outfitImagesBase64.push(itemBase64);
        }
      }

      const itemsDesc = outfit.items.map(i => `${i.color} ${i.material || ''} ${i.subcategory}`).join(', ');

      // Construct the prompt for image generation - emphasize full body
      const clothingList = outfit.items.map(i => `- ${i.color} ${i.subcategory}`).join(', ');
      const prompt = `Create a FULL BODY fashion photograph from head to toe. SUBJECT: The exact same person from the first reference image (same face, hair color, skin tone, body type). CLOTHING: Dress this person in: ${clothingList}. REQUIREMENTS: MUST show complete full body from head to feet, standing pose facing camera, person's face and features must match reference photo exactly, professional fashion photography with studio lighting, clean white or neutral background, high fashion editorial style, show entire outfit clearly visible. Generate a single realistic photograph.`;

      // Call the image generation API with all reference images
      const allImages = [photoBase64, ...outfitImagesBase64];
      const resultImage = await generateMultimodalImage(prompt, allImages);

      setGeneratedImage(resultImage);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to generate image. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-white w-full max-w-md h-full max-h-screen flex flex-col animate-in slide-in-from-bottom-full duration-300">
        <div className="p-4 flex justify-between items-center border-b border-zinc-100">
          <h2 className="font-medium flex items-center gap-2">
            <Sparkles size={18} className="text-amber-500" /> Virtual Try-On
          </h2>
          <button onClick={onClose}><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-zinc-50">
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm mb-4 flex items-start gap-3">
              <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          {generatedImage ? (
            <div className="space-y-4">
              <div className="relative">
                <img
                  src={generatedImage}
                  alt="Virtual Try-On Result"
                  className="w-full rounded-2xl shadow-xl"
                />
              </div>

              <div className="bg-white p-4 rounded-xl shadow-sm">
                <h4 className="text-xs font-bold text-zinc-400 uppercase mb-3">Outfit: {outfit.name}</h4>
                <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                  {outfit.items.map((item, i) => (
                    <div key={i} className="flex-shrink-0 text-center">
                      <LazyImage src={item.image} className="w-16 h-16 rounded-lg object-cover border border-zinc-100 mb-1" alt={item.subcategory} />
                      <span className="text-[10px] text-zinc-500">{item.subcategory}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={() => setGeneratedImage(null)} variant="outline" className="flex-1">
                  <RefreshCw size={16} /> Try Again
                </Button>
                <a href={generatedImage} download="wair-tryon.png" className="flex-1">
                  <Button variant="secondary" className="w-full">
                    <Download size={16} /> Save
                  </Button>
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-white p-4 rounded-xl shadow-sm">
                <h3 className="text-sm font-bold mb-2">1. The Outfit</h3>
                <p className="text-sm text-zinc-600 mb-3">{outfit.name}</p>
                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                  {outfit.items.map((item, i) => (
                    <div key={i} className="flex-shrink-0 relative">
                      <LazyImage src={item.image} className="w-16 h-20 rounded-lg object-cover border border-zinc-100" alt={item.subcategory} />
                      <span className="text-[10px] text-zinc-400 block text-center mt-1">{item.category}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold mb-3">2. Select Your Photo</h3>
                {!profile?.gallery?.length ? (
                  <div className="text-center p-8 bg-zinc-100 rounded-xl text-zinc-500">
                    <User size={32} className="mx-auto mb-2 opacity-40" />
                    <p>No photos in gallery.</p>
                    <p className="text-xs mt-1">Go to Profile to upload photos first.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {profile.gallery.map((img, idx) => (
                      <div
                        key={idx}
                        onClick={() => setSelectedPhoto(img)}
                        className={`relative aspect-[3/4] rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${selectedPhoto === img ? 'border-zinc-900 ring-2 ring-zinc-900 ring-offset-2' : 'border-transparent hover:border-zinc-300'}`}
                      >
                        <LazyImage src={img} className="w-full h-full object-cover" alt={`Option ${idx + 1}`} />
                        {selectedPhoto === img && <div className="absolute inset-0 bg-black/20 flex items-center justify-center"><Check className="text-white" /></div>}
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-zinc-400 mt-2 text-center">Select a photo to visualize yourself in this outfit</p>
              </div>
            </div>
          )}
        </div>

        {!generatedImage && (
          <div className="p-6 bg-white border-t border-zinc-100">
            <Button onClick={handleGenerate} disabled={!selectedPhoto || loading} className="w-full">
              {loading ? <><Loader2 className="animate-spin" /> Generating...</> : <><Sparkles size={16} /> Generate Try-On Image</>}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

const WardrobeView = ({ items, onAdd, onDelete, onReset, loading }) => {
  const [filter, setFilter] = useState('All');
  const [showInsights, setShowInsights] = useState(false);
  const categories = ['All', 'Top', 'Bottom', 'Shoes', 'Outerwear', 'Dress', 'Accessory'];
  const filteredItems = filter === 'All' ? items : items.filter(item => item.category === filter);

  // Count items per category
  const categoryCounts = categories.reduce((acc, cat) => {
    acc[cat] = cat === 'All' ? items.length : items.filter(i => i.category === cat).length;
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full bg-white relative animate-in fade-in duration-300">
      <div className="px-6 py-6 pb-2">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-light tracking-tight">Wardrobe</h1>
            <p className="text-xs text-zinc-400 mt-1">{items.length} items</p>
          </div>
          <div className="flex gap-2">
            <button
               onClick={onReset}
               className="text-xs font-bold text-zinc-600 flex items-center gap-1 bg-zinc-100 px-3 py-1.5 rounded-full border border-zinc-200"
            >
               <RefreshCw size={12} /> Reset
            </button>
            <button
               onClick={() => setShowInsights(true)}
               disabled={items.length === 0}
               className="text-xs font-bold text-amber-600 flex items-center gap-1 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-100 disabled:opacity-50"
            >
               <Sparkles size={12} /> Insights
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pb-4">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter === cat ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600'}`}
            >
              {cat} ({categoryCounts[cat]})
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 pb-24">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-400">
            <Loader2 className="animate-spin mb-4" size={32} />
            <p>Loading your wardrobe...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center mt-20 text-zinc-400">
            <Shirt size={48} className="mx-auto mb-4 opacity-20" />
            <p>Your wardrobe is empty</p>
            <p className="text-sm mt-1">Add your first item to get started!</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center mt-20 text-zinc-400">
            <p>No {filter.toLowerCase()} items found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {filteredItems.map(item => (
              <div key={item.id} className="group relative aspect-[3/4] rounded-2xl overflow-hidden bg-zinc-50 border border-zinc-100">
                <LazyImage src={item.image} alt={item.subcategory} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                  <p className="text-white text-sm font-medium truncate">{item.subcategory}</p>
                  <p className="text-white/70 text-xs">{item.color}</p>
                  <button
                    onClick={() => onDelete(item.id)}
                    className="absolute top-2 right-2 p-2 bg-white/20 hover:bg-red-500 backdrop-blur-md rounded-full text-white transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={onAdd}
        className="absolute bottom-6 right-6 w-14 h-14 bg-zinc-900 text-white rounded-full shadow-xl flex items-center justify-center hover:scale-105 transition-transform active:scale-95"
      >
        <Plus size={24} />
      </button>

      {showInsights && <WardrobeInsightsModal items={items} onClose={() => setShowInsights(false)} />}
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('wardrobe');
  const [activeChatId, setActiveChatId] = useState(null);
  const [wardrobe, setWardrobe] = useState([]);
  const [wardrobeLoading, setWardrobeLoading] = useState(true);
  const [chats, setChats] = useState([]);
  const [profile, setProfile] = useState({ gallery: [], attributes: {} });
  const [tryOnOutfit, setTryOnOutfit] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error('Auth error:', error);
        setToast({ message: 'Authentication failed. Some features may not work.', type: 'error' });
      }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) return;

    setWardrobeLoading(true);

    // Wardrobe Sync
    const unsubWardrobe = onSnapshot(
      query(collection(db, 'artifacts', appId, 'users', user.uid, 'wardrobe'), orderBy('createdAt', 'desc')),
      (snap) => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setWardrobe(items);
        setWardrobeLoading(false);

        // Auto-load demo if empty (once)
        if (items.length === 0) {
          const batch = generateDemoWardrobe();
          batch.forEach(item => addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'wardrobe'), item));
        }
      },
      (error) => {
        console.error('Wardrobe sync error:', error);
        setWardrobeLoading(false);
        setToast({ message: 'Failed to load wardrobe', type: 'error' });
      }
    );

    // Chat List Sync
    const unsubChats = onSnapshot(
      query(collection(db, 'artifacts', appId, 'users', user.uid, 'chats'), orderBy('updatedAt', 'desc')),
      (snap) => {
        setChats(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    );

    // Profile Sync
    const fetchProfile = async () => {
      try {
        const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setProfile(snap.data());
        } else {
          const defaultProfile = {
            gallery: DEMO_GALLERY_IMAGES,
            attributes: { gender: 'Woman', hair: 'Brunette', skinTone: 'Light', bodyType: 'Slim', summary: 'Demo Profile' }
          };
          setDoc(docRef, defaultProfile);
          setProfile(defaultProfile);
        }
      } catch (error) {
        console.error('Profile fetch error:', error);
      }
    };
    fetchProfile();

    return () => { unsubWardrobe(); unsubChats(); };
  }, [user]);

  const handleCreateChat = async () => {
    try {
      const docRef = await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'chats'), {
        title: 'New Session',
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp()
      });
      setActiveChatId(docRef.id);
      setView('chatDetail');
    } catch (error) {
      setToast({ message: 'Failed to create chat', type: 'error' });
    }
  };

  const handleDeleteChat = async (chatId) => {
    if (confirm("Delete this chat?")) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'chats', chatId));
      } catch (error) {
        setToast({ message: 'Failed to delete chat', type: 'error' });
      }
    }
  };

  const handleUpdateProfile = async (newProfile) => {
    setProfile(newProfile);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), newProfile);
    } catch (error) {
      setToast({ message: 'Failed to save profile', type: 'error' });
    }
  };

  const handleDeleteItem = async (id) => {
     if (confirm("Delete this item?")) {
       try {
         await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'wardrobe', id));
       } catch (error) {
         setToast({ message: 'Failed to delete item', type: 'error' });
       }
     }
  };

  const handleResetWardrobe = async () => {
    if (confirm("Reset wardrobe with fresh demo items? This will delete all current items.")) {
      try {
        // Delete all existing items
        for (const item of wardrobe) {
          await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'wardrobe', item.id));
        }
        // Add fresh demo items
        const batch = generateDemoWardrobe();
        for (const item of batch) {
          await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'wardrobe'), item);
        }
        setToast({ message: 'Wardrobe reset with demo items!', type: 'success' });
      } catch (error) {
        setToast({ message: 'Failed to reset wardrobe', type: 'error' });
      }
    }
  };

  const handleAddItem = async (data) => {
    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'wardrobe'), data);
      setView('wardrobe');
      setToast({ message: 'Item added to wardrobe!', type: 'success' });
    } catch (error) {
      setToast({ message: 'Failed to add item', type: 'error' });
    }
  };

  if (!user) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-white">
        <Loader2 className="animate-spin mb-4" size={32} />
        <p className="text-zinc-500 text-sm">Loading WAIR...</p>
      </div>
    );
  }

  return (
    <OnlineProvider>
      <ErrorBoundary>
        <div className="flex flex-col h-screen w-full max-w-md mx-auto bg-white overflow-hidden shadow-2xl">
          <div className="flex-1 overflow-hidden relative">
            <ErrorBoundary>
              {view === 'wardrobe' && (
                <WardrobeView
                  items={wardrobe}
                  loading={wardrobeLoading}
                  onAdd={() => setView('addItem')}
                  onDelete={handleDeleteItem}
                  onReset={handleResetWardrobe}
                />
              )}
              {view === 'addItem' && (
                <AddItemView
                  onSave={handleAddItem}
                  onCancel={() => setView('wardrobe')}
                />
              )}
              {view === 'profile' && (
                <ProfileView
                  profile={profile}
                  onUpdateProfile={handleUpdateProfile}
                />
              )}
              {view === 'chatList' && (
                <ChatListView
                  chats={chats}
                  onCreateChat={handleCreateChat}
                  onSelectChat={(id) => { setActiveChatId(id); setView('chatDetail'); }}
                  onDeleteChat={handleDeleteChat}
                />
              )}
              {view === 'chatDetail' && (
                <ChatDetailView
                  chatId={activeChatId}
                  user={user}
                  wardrobe={wardrobe}
                  profile={profile}
                  onBack={() => setView('chatList')}
                  onTryOn={(outfit) => setTryOnOutfit(outfit)}
                />
              )}
            </ErrorBoundary>
          </div>

          {/* Navigation */}
          {view !== 'addItem' && view !== 'chatDetail' && (
            <div className="bg-white border-t border-zinc-100 px-6 py-4 flex justify-between text-xs font-medium text-zinc-400">
              <button onClick={() => setView('wardrobe')} className={`flex flex-col items-center gap-1 transition-colors ${view === 'wardrobe' ? 'text-zinc-900' : 'hover:text-zinc-600'}`}>
                <Shirt size={24} strokeWidth={view === 'wardrobe' ? 2.5 : 2} />
                Wardrobe
              </button>
              <button onClick={() => setView('chatList')} className={`flex flex-col items-center gap-1 transition-colors ${view === 'chatList' ? 'text-zinc-900' : 'hover:text-zinc-600'}`}>
                <MessageSquare size={24} strokeWidth={view === 'chatList' ? 2.5 : 2} />
                Stylist
              </button>
              <button onClick={() => setView('profile')} className={`flex flex-col items-center gap-1 transition-colors ${view === 'profile' ? 'text-zinc-900' : 'hover:text-zinc-600'}`}>
                <User size={24} strokeWidth={view === 'profile' ? 2.5 : 2} />
                Profile
              </button>
            </div>
          )}

          {/* Modals */}
          {tryOnOutfit && (
            <TryOnModal
              outfit={tryOnOutfit}
              profile={profile}
              onClose={() => setTryOnOutfit(null)}
            />
          )}

          {/* Toast Notifications */}
          {toast && (
            <Toast
              message={toast.message}
              type={toast.type}
              onClose={() => setToast(null)}
            />
          )}
        </div>
      </ErrorBoundary>
    </OnlineProvider>
  );
}
