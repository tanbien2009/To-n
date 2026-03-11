import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { 
  UploadCloud, Camera, CheckCircle, XCircle, 
  Clock, Award, FileText, Download, History as HistoryIcon,
  Trash2, X, ImageIcon, Loader2, Calculator, Edit3
} from 'lucide-react';

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface GradingDetail {
  cauSo: string;
  deBai: string;
  baiLamHocSinh: string;
  dapAnDung: string;
  ketQua: 'dung' | 'sai';
  giaiThich: string;
  toaDoX: number;
  toaDoY: number;
  imageIndex: number; // Chỉ số ảnh bài làm (0, 1, 2...)
}

interface GradingResult {
  id: string;
  timestamp: number;
  studentWorkImages: string[];
  problemImages: string[];
  problemText?: string;
  gradeLevel: string;
  tongSoCau: number;
  soCauDung: number;
  soCauSai: number;
  diem: string;
  chiTiet: GradingDetail[];
  nhanXetChung: string;
  gradingTimeMs: number;
}

export default function App() {
  const [studentWorkImages, setStudentWorkImages] = useState<string[]>([]);
  const [problemImages, setProblemImages] = useState<string[]>([]);
  const [problemText, setProblemText] = useState('');
  
  const [isDraggingBailam, setIsDraggingBailam] = useState(false);
  const [isDraggingDe, setIsDraggingDe] = useState(false);
  
  const [activeCamera, setActiveCamera] = useState<'de' | 'bailam' | null>(null);
  const [gradeLevel, setGradeLevel] = useState('Lớp 6-9');
  const [isGrading, setIsGrading] = useState(false);
  const [result, setResult] = useState<GradingResult | null>(null);
  const [history, setHistory] = useState<GradingResult[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bailamInputRef = useRef<HTMLInputElement>(null);
  const deInputRef = useRef<HTMLInputElement>(null);

  // Load history on mount
  useEffect(() => {
    const saved = localStorage.getItem('gradingHistory');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse history', e);
      }
    }
  }, []);

  // Save history when it changes
  useEffect(() => {
    localStorage.setItem('gradingHistory', JSON.stringify(history));
  }, [history]);

  const processFile = (file: File, type: 'de' | 'bailam') => {
    if (!file.type.startsWith('image/')) {
      setError('Vui lòng chọn file ảnh hợp lệ.');
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (type === 'de') setProblemImages(prev => [...prev, dataUrl]);
      else setStudentWorkImages(prev => [...prev, dataUrl]);
      setResult(null);
    };
    reader.readAsDataURL(file);
  };

  // Camera handling
  const startCamera = async (type: 'de' | 'bailam') => {
    setActiveCamera(type);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      setError('Không thể truy cập camera. Vui lòng kiểm tra quyền.');
      setActiveCamera(null);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    setActiveCamera(null);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current && activeCamera) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        if (activeCamera === 'de') setProblemImages(prev => [...prev, dataUrl]);
        else setStudentWorkImages(prev => [...prev, dataUrl]);
        setResult(null);
        stopCamera();
      }
    }
  };

  // Grading logic
  const handleGrade = async () => {
    if (studentWorkImages.length === 0) {
      setError('Vui lòng cung cấp ít nhất một ảnh bài làm của học sinh.');
      return;
    }
    
    setIsGrading(true);
    setError(null);
    const startTime = Date.now();

    try {
      const parts: any[] = [];
      
      let prompt = `Bạn là một giáo viên dạy toán chuyên nghiệp, có tâm và tỉ mỉ. 
Hãy chấm bài làm toán của học sinh dựa trên các thông tin được cung cấp.

Cấp độ học sinh: ${gradeLevel}.

Nguồn dữ liệu đề bài (AI cần kết hợp tất cả các nguồn nếu có):`;

      if (problemText) {
        prompt += `\n- Nội dung đề bài (văn bản): "${problemText}"`;
      }
      
      if (problemImages.length > 0) {
        prompt += `\n- Ảnh chụp đề bài: Có ${problemImages.length} ảnh đề bài đính kèm. AI hãy phân tích tất cả các ảnh này để hiểu rõ các yêu cầu, hình vẽ hoặc bảng biểu.`;
        problemImages.forEach((url, index) => {
          const base64 = url.split(',')[1];
          const mime = url.split(';')[0].split(':')[1];
          parts.push({
            inlineData: { mimeType: mime, data: base64 }
          });
        });
      }

      prompt += `\n\nNguồn dữ liệu bài làm:
- Ảnh chụp bài làm của học sinh: Có ${studentWorkImages.length} ảnh bài làm đính kèm. Đây là đối tượng chính cần chấm điểm.

Nhiệm vụ chi tiết:
1. Phân tích đề bài từ văn bản và/hoặc ảnh đề bài để nắm vững yêu cầu.
2. Đối chiếu với bài làm của học sinh trong TẤT CẢ các ảnh bài làm được cung cấp.
3. Chấm điểm từng câu/bước:
   - Nếu đúng: Xác nhận là 'dung'.
   - Nếu sai: Xác định là 'sai', chỉ rõ lỗi sai cụ thể (sai logic, sai tính toán, hay sai phương pháp) và đưa ra đáp án đúng.
4. Phản hồi chi tiết: Với mỗi câu, hãy giải thích tại sao học sinh sai hoặc khen ngợi nếu có cách giải hay.
5. Tọa độ và Chỉ số ảnh: 
   - Cung cấp tọa độ (toaDoX, toaDoY) từ 0-100 tương ứng với vị trí câu trả lời trên ảnh bài làm.
   - Cung cấp imageIndex (0, 1, 2...) tương ứng với thứ tự ảnh bài làm trong danh sách đính kèm mà câu đó xuất hiện.
6. Tổng kết: Tính tổng số câu, số câu đúng/sai, thang điểm 10 và đưa ra nhận xét tổng quát mang tính khuyến khích.

Yêu cầu định dạng: Trả về JSON chính xác theo schema.`;

      studentWorkImages.forEach((url, index) => {
        const base64 = url.split(',')[1];
        const mime = url.split(';')[0].split(':')[1];
        parts.push({
          inlineData: { mimeType: mime, data: base64 }
        });
      });
      
      parts.push({ text: prompt });

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: parts,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tongSoCau: { type: Type.INTEGER },
              soCauDung: { type: Type.INTEGER },
              soCauSai: { type: Type.INTEGER },
              diem: { type: Type.STRING },
              chiTiet: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    cauSo: { type: Type.STRING },
                    deBai: { type: Type.STRING },
                    baiLamHocSinh: { type: Type.STRING },
                    dapAnDung: { type: Type.STRING },
                    ketQua: { type: Type.STRING, description: "Chỉ được trả về 'dung' hoặc 'sai'" },
                    giaiThich: { type: Type.STRING },
                    toaDoX: { type: Type.NUMBER },
                    toaDoY: { type: Type.NUMBER },
                    imageIndex: { type: Type.INTEGER, description: "Chỉ số của ảnh bài làm chứa câu này (bắt đầu từ 0)" }
                  },
                  required: ["cauSo", "deBai", "baiLamHocSinh", "dapAnDung", "ketQua", "giaiThich", "toaDoX", "toaDoY", "imageIndex"]
                }
              },
              nhanXetChung: { type: Type.STRING }
            },
            required: ["tongSoCau", "soCauDung", "soCauSai", "diem", "chiTiet", "nhanXetChung"]
          }
        }
      });

      if (!response.text) throw new Error("Không nhận được phản hồi từ AI.");

      const resultData = JSON.parse(response.text);
      const gradingTimeMs = Date.now() - startTime;

      const newResult: GradingResult = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        studentWorkImages,
        problemImages,
        problemText,
        gradeLevel,
        ...resultData,
        gradingTimeMs
      };

      setResult(newResult);
      setHistory(prev => [newResult, ...prev].slice(0, 20));
      
    } catch (err: any) {
      console.error("Grading error:", err);
      setError(err.message || 'Có lỗi xảy ra khi chấm bài.');
    } finally {
      setIsGrading(false);
    }
  };

  const loadHistoryItem = (item: GradingResult) => {
    setStudentWorkImages(item.studentWorkImages);
    setProblemImages(item.problemImages);
    setProblemText(item.problemText || '');
    setResult(item);
    setGradeLevel(item.gradeLevel);
    setShowHistory(false);
  };

  const clearAll = () => {
    setStudentWorkImages([]);
    setProblemImages([]);
    setProblemText('');
    setResult(null);
    setError(null);
  };

  const handleDragOver = (e: React.DragEvent, type: 'de' | 'bailam') => {
    e.preventDefault();
    if (type === 'de') setIsDraggingDe(true);
    else setIsDraggingBailam(true);
  };

  const handleDragLeave = (type: 'de' | 'bailam') => {
    if (type === 'de') setIsDraggingDe(false);
    else setIsDraggingBailam(false);
  };

  const handleDrop = (e: React.DragEvent, type: 'de' | 'bailam') => {
    e.preventDefault();
    if (type === 'de') setIsDraggingDe(false);
    else setIsDraggingBailam(false);
    
    const files = Array.from(e.dataTransfer.files as FileList);
    files.forEach((file: File) => processFile(file, type));
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Calculator className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Chấm Toán AI</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={clearAll}
              className="p-2 text-slate-400 hover:text-rose-600 rounded-lg transition-colors flex items-center gap-1.5 text-sm font-medium"
              title="Xóa tất cả"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Làm mới</span>
            </button>

            <select 
              value={gradeLevel}
              onChange={(e) => setGradeLevel(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Lớp 1-5">Lớp 1-5</option>
              <option value="Lớp 6-9">Lớp 6-9</option>
              <option value="Lớp 10-12">Lớp 10-12</option>
            </select>
            
            <button 
              onClick={() => setShowHistory(true)}
              className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <HistoryIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-start gap-3 print:hidden">
            <XCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Inputs Column */}
          <div className="lg:col-span-5 space-y-6 print:hidden">
            {/* Section 1: Problem Text */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Edit3 className="w-4 h-4" />
                1. Gõ đề bài (tùy chọn)
              </h2>
              <textarea
                value={problemText}
                onChange={(e) => setProblemText(e.target.value)}
                placeholder="Nhập nội dung đề bài tại đây..."
                className="w-full min-h-[120px] p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none text-sm"
              />
            </div>

            {/* Section 2: Problem Images */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <ImageIcon className="w-3.5 h-3.5" />
                  2. Ảnh đề bài ({problemImages.length})
                </h2>
                {problemImages.length > 0 && (
                  <button 
                    onClick={() => setProblemImages([])}
                    className="text-[10px] font-bold text-rose-500 hover:text-rose-700 transition-colors"
                  >
                    Xóa hết
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {problemImages.map((url, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-100 group">
                    <img src={url} className="w-full h-full object-cover" alt={`Đề ${idx + 1}`} />
                    <button 
                      onClick={() => setProblemImages(prev => prev.filter((_, i) => i !== idx))}
                      className="absolute top-1 right-1 p-1 bg-white/80 backdrop-blur-sm rounded-md text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <div 
                  className={`aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all
                    ${isDraggingDe ? 'border-blue-500 bg-blue-50 scale-[1.02]' : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50'}`}
                  onClick={() => deInputRef.current?.click()}
                  onDragOver={(e) => handleDragOver(e, 'de')}
                  onDragLeave={() => handleDragLeave('de')}
                  onDrop={(e) => handleDrop(e, 'de')}
                >
                  <UploadCloud className="w-6 h-6 text-slate-300 mb-1" />
                  <span className="text-[10px] text-slate-400">Thêm ảnh</span>
                </div>
              </div>
              <input type="file" ref={deInputRef} className="hidden" accept="image/*" multiple onChange={(e) => {
                if (e.target.files) {
                  Array.from(e.target.files as FileList).forEach((file: File) => processFile(file, 'de'));
                }
              }} />
              <button 
                onClick={() => startCamera('de')}
                className="w-full py-2 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-2"
              >
                <Camera className="w-3.5 h-3.5" /> Chụp ảnh đề
              </button>
            </div>

            {/* Section 3: Student Work Images */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold text-blue-600 uppercase tracking-wider flex items-center gap-2">
                  <ImageIcon className="w-3.5 h-3.5" />
                  3. Ảnh bài làm ({studentWorkImages.length}) *
                </h2>
                {studentWorkImages.length > 0 && (
                  <button 
                    onClick={() => { setStudentWorkImages([]); setResult(null); }}
                    className="text-[10px] font-bold text-rose-500 hover:text-rose-700 transition-colors"
                  >
                    Xóa hết
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {studentWorkImages.map((url, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-100 group">
                    <img src={url} className="w-full h-full object-cover" alt={`Bài làm ${idx + 1}`} />
                    <button 
                      onClick={() => {
                        setStudentWorkImages(prev => prev.filter((_, i) => i !== idx));
                        setResult(null);
                      }}
                      className="absolute top-1 right-1 p-1 bg-white/80 backdrop-blur-sm rounded-md text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <div 
                  className={`aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all
                    ${isDraggingBailam ? 'border-blue-500 bg-blue-50 scale-[1.02]' : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50'}`}
                  onClick={() => bailamInputRef.current?.click()}
                  onDragOver={(e) => handleDragOver(e, 'bailam')}
                  onDragLeave={() => handleDragLeave('bailam')}
                  onDrop={(e) => handleDrop(e, 'bailam')}
                >
                  <UploadCloud className="w-6 h-6 text-blue-300 mb-1" />
                  <span className="text-[10px] text-slate-400">Thêm ảnh</span>
                </div>
              </div>
              <input type="file" ref={bailamInputRef} className="hidden" accept="image/*" multiple onChange={(e) => {
                if (e.target.files) {
                  Array.from(e.target.files as FileList).forEach((file: File) => processFile(file, 'bailam'));
                }
              }} />
              <button 
                onClick={() => startCamera('bailam')}
                className="w-full py-2 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-2"
              >
                <Camera className="w-3.5 h-3.5" /> Chụp bài làm
              </button>
            </div>

            <button 
              onClick={handleGrade}
              disabled={isGrading || studentWorkImages.length === 0}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:bg-slate-300 disabled:shadow-none transition-all active:scale-[0.98] flex items-center justify-center gap-3"
            >
              {isGrading ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  Đang chấm bài...
                </>
              ) : (
                <>
                  <CheckCircle className="w-6 h-6" />
                  Bắt đầu chấm bài
                </>
              )}
            </button>
          </div>

          {/* Results Column */}
          <div className="lg:col-span-7 space-y-6">
            {isGrading && (
              <div className="bg-white p-12 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-6"></div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">AI đang phân tích...</h3>
                <p className="text-slate-500">Đang đọc chữ viết tay và kiểm tra logic toán học.</p>
              </div>
            )}

            {result && !isGrading && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Visual Feedback on Images */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 print:p-0">
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 print:hidden">Minh họa kết quả</h3>
                  <div className="space-y-6">
                    {result.studentWorkImages.map((imgUrl, imgIdx) => (
                      <div key={imgIdx} className="space-y-2">
                        <div className="text-xs font-bold text-slate-400 uppercase">Trang {imgIdx + 1}</div>
                        <div className="relative rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                          <img src={imgUrl} className="w-full h-auto" alt={`Kết quả trang ${imgIdx + 1}`} />
                          {result.chiTiet.filter(item => item.imageIndex === imgIdx).map((item, idx) => (
                            <div 
                              key={idx} 
                              className="absolute transform -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 bg-white/90 p-1 rounded-lg shadow-sm backdrop-blur-sm border border-slate-100"
                              style={{ left: `${item.toaDoX}%`, top: `${item.toaDoY}%` }}
                            >
                              {item.ketQua === 'dung' ? (
                                <CheckCircle className="w-5 h-5 text-emerald-500" />
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <XCircle className="w-5 h-5 text-rose-500" />
                                  <span className="text-[10px] font-bold text-rose-600 px-1">{item.dapAnDung}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Score Summary */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                      <Award className="w-6 h-6 text-amber-500" />
                      Tổng kết bài làm
                    </h2>
                    <button onClick={() => window.print()} className="p-2 text-slate-400 hover:text-blue-600 transition-colors print:hidden">
                      <Download className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="p-4 bg-blue-50 rounded-2xl text-center">
                      <div className="text-[10px] font-bold text-blue-600 uppercase mb-1">Điểm số</div>
                      <div className="text-3xl font-black text-blue-900">{result.diem}</div>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl text-center">
                      <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Tổng câu</div>
                      <div className="text-2xl font-bold text-slate-800">{result.tongSoCau}</div>
                    </div>
                    <div className="p-4 bg-emerald-50 rounded-2xl text-center">
                      <div className="text-[10px] font-bold text-emerald-600 uppercase mb-1">Đúng</div>
                      <div className="text-2xl font-bold text-emerald-700">{result.soCauDung}</div>
                    </div>
                    <div className="p-4 bg-rose-50 rounded-2xl text-center">
                      <div className="text-[10px] font-bold text-rose-600 uppercase mb-1">Sai</div>
                      <div className="text-2xl font-bold text-rose-700">{result.soCauSai}</div>
                    </div>
                  </div>

                  <div className="mt-6 p-4 bg-amber-50 border border-amber-100 rounded-xl">
                    <h4 className="text-xs font-bold text-amber-800 uppercase mb-1">Nhận xét của giáo viên AI:</h4>
                    <p className="text-sm text-slate-700 leading-relaxed">{result.nhanXetChung}</p>
                  </div>
                </div>

                {/* Details List */}
                <div className="space-y-4">
                  {result.chiTiet.map((item, idx) => (
                    <div key={idx} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                      <div className={`px-4 py-3 flex items-center justify-between ${item.ketQua === 'dung' ? 'bg-emerald-50/50' : 'bg-rose-50/50'}`}>
                        <div className="flex items-center gap-2">
                          {item.ketQua === 'dung' ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-rose-500" />}
                          <span className="font-bold text-slate-800">Câu {item.cauSo}</span>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.ketQua === 'dung' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                          {item.ketQua === 'dung' ? 'ĐÚNG' : 'SAI'}
                        </span>
                      </div>
                      <div className="p-4 space-y-3 text-sm">
                        <p><span className="text-slate-400 font-medium">Đề bài:</span> {item.deBai}</p>
                        <div className="grid grid-cols-2 gap-4">
                          <p><span className="text-slate-400 font-medium">Học sinh làm:</span> <span className={item.ketQua === 'sai' ? 'text-rose-600 font-medium' : ''}>{item.baiLamHocSinh}</span></p>
                          {item.ketQua === 'sai' && <p><span className="text-emerald-600 font-medium">Đáp án đúng:</span> <span className="font-bold text-emerald-700">{item.dapAnDung}</span></p>}
                        </div>
                        <p className="text-slate-500 italic text-xs border-t border-slate-50 pt-2">{item.giaiThich}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!result && !isGrading && (
              <div className="bg-white p-12 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center text-center text-slate-400">
                <FileText className="w-16 h-16 mb-4 opacity-20" />
                <p>Kết quả chấm bài sẽ xuất hiện tại đây sau khi bạn nhấn nút "Bắt đầu chấm bài".</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Camera Modal */}
      {activeCamera && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
          <div className="p-4 flex justify-between items-center text-white">
            <h3 className="font-bold">Chụp ảnh {activeCamera === 'de' ? 'đề bài' : 'bài làm'}</h3>
            <button onClick={stopCamera} className="p-2 hover:bg-white/10 rounded-full"><X /></button>
          </div>
          <div className="flex-1 relative flex items-center justify-center">
            <video ref={videoRef} autoPlay playsInline className="max-w-full max-h-full" />
            <canvas ref={canvasRef} className="hidden" />
          </div>
          <div className="p-8 flex justify-center">
            <button 
              onClick={capturePhoto}
              className="w-20 h-20 bg-white rounded-full border-4 border-slate-300 active:scale-95 transition-transform"
            />
          </div>
        </div>
      )}

      {/* History Sidebar */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={() => setShowHistory(false)}></div>
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <HistoryIcon className="w-6 h-6" />
                Lịch sử chấm bài
              </h2>
              <button onClick={() => setShowHistory(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {history.length === 0 ? (
                <div className="text-center py-12 text-slate-400">Chưa có lịch sử chấm bài</div>
              ) : (
                history.map((item) => (
                  <div 
                    key={item.id}
                    onClick={() => loadHistoryItem(item)}
                    className="p-4 border border-slate-100 rounded-2xl hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-all group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                        {item.gradeLevel}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(item.timestamp).toLocaleString('vi-VN')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-slate-800 text-lg">Điểm: {item.diem}</div>
                      <div className="text-xs text-slate-500">
                        {item.soCauDung} Đúng / {item.soCauSai} Sai
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
