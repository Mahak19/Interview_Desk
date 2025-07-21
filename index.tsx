import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Chat } from "@google/genai";

// --- Interfaces ---
interface Message {
    sender: 'user' | 'ai';
    text: string;
}

// --- Main App Component ---
const App: React.FC = () => {
    const [interviewStarted, setInterviewStarted] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [chat, setChat] = useState<Chat | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const chatLogRef = useRef<HTMLDivElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Scroll to bottom of chat log
    useEffect(() => {
        if (chatLogRef.current) {
            chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
        }
    }, [messages]);

    // Cleanup camera stream
    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    const startInterview = async () => {
        setError(null);
        setIsLoading(true);

        // 1. Request camera permissions
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            streamRef.current = stream;
        } catch (err) {
            console.error("Camera access denied:", err);
            setError("Camera access is required for the interview. Please enable it and try again.");
            setIsLoading(false);
            return;
        }

        // 2. Initialize Gemini Chat
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const chatSession = ai.chats.create({
                model: 'gemini-2.5-flash',
                config: {
                    systemInstruction: "You are a friendly but professional interviewer for a software engineering role. Your goal is to assess the candidate's skills and experience. Start with a greeting and then ask your first question. Keep your questions concise and relevant. After the user responds, ask a logical follow-up question.",
                },
            });
            setChat(chatSession);

            // 3. Get the first message from the AI
            const responseStream = await chatSession.sendMessageStream({ message: "Start the interview." });
            
            setInterviewStarted(true);
            setIsLoading(false);

            setMessages([{ sender: 'ai', text: '' }]);
            let currentMessage = '';
            for await (const chunk of responseStream) {
                 currentMessage += chunk.text;
                 setMessages(prev => {
                     const updated = [...prev];
                     updated[updated.length - 1] = { sender: 'ai', text: currentMessage };
                     return updated;
                 });
            }

        } catch (err) {
            console.error("AI initialization failed:", err);
            setError("Could not start the AI session. Please check your network connection and API key, then try again.");
            setIsLoading(false);
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        }
    };

    const handleSendMessage = async (userInput: string) => {
        if (!userInput.trim() || !chat || isLoading) return;

        const newMessages: Message[] = [...messages, { sender: 'user', text: userInput }];
        setMessages(newMessages);
        setIsLoading(true);
        setError(null);

        try {
            const responseStream = await chat.sendMessageStream({ message: userInput });
            
            let currentAIMessage = '';
            setMessages(prev => [...prev, { sender: 'ai', text: '' }]);
            
            for await (const chunk of responseStream) {
                currentAIMessage += chunk.text;
                setMessages(prev => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { sender: 'ai', text: currentAIMessage };
                    return updated;
                });
            }

        } catch (err) {
            console.error("Error sending message:", err);
            setError("Sorry, an error occurred while getting the next question.");
             setMessages(prev => [...prev.slice(0,-1)]); // remove the empty AI message
        } finally {
            setIsLoading(false);
        }
    };

    if (!interviewStarted) {
        return <WelcomeScreen onStart={startInterview} isLoading={isLoading} error={error} />;
    }

    return (
        <InterviewScreen
            videoRef={videoRef}
            chatLogRef={chatLogRef}
            messages={messages}
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
        />
    );
};


// --- Child Components ---

const WelcomeScreen: React.FC<{ onStart: () => void; isLoading: boolean; error: string | null }> = ({ onStart, isLoading, error }) => (
    <div className="app-container">
        <div className="welcome-screen">
            <h1>AI Interview Coach</h1>
            <p>Practice your interview skills in a real-time simulation. Get ready to answer questions while seeing yourself on camera, just like a real video interview.</p>
            <button className="start-button" onClick={onStart} disabled={isLoading}>
                {isLoading ? 'Starting...' : 'Start Interview'}
            </button>
            {error && <p className="error-message">{error}</p>}
        </div>
    </div>
);

interface InterviewScreenProps {
    videoRef: React.RefObject<HTMLVideoElement>;
    chatLogRef: React.RefObject<HTMLDivElement>;
    messages: Message[];
    onSendMessage: (input: string) => void;
    isLoading: boolean;
}

const InterviewScreen: React.FC<InterviewScreenProps> = ({ videoRef, chatLogRef, messages, onSendMessage, isLoading }) => (
    <div className="interview-container">
        <div className="video-container">
            <video id="video-feed" ref={videoRef} autoPlay playsInline muted />
        </div>
        <div className="chat-container">
            <div className="chat-log" ref={chatLogRef}>
                {messages.map((msg, index) => (
                    <div key={index} className={`message ${msg.sender}`}>
                        <div className="message-bubble">{msg.text}</div>
                    </div>
                ))}
                {isLoading && messages[messages.length -1]?.sender === 'user' && (
                     <div className="message ai">
                         <div className="message-bubble typing-indicator">
                            <span></span><span></span><span></span>
                         </div>
                    </div>
                )}
            </div>
            <ChatInput onSend={onSendMessage} disabled={isLoading} />
        </div>
    </div>
);

const ChatInput: React.FC<{ onSend: (input: string) => void; disabled: boolean }> = ({ onSend, disabled }) => {
    const [input, setInput] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim()) {
            onSend(input);
            setInput('');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="chat-input-form">
            <input
                id="chat-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your answer here..."
                disabled={disabled}
                autoComplete="off"
                aria-label="Your answer"
            />
        </form>
    );
};


// --- Render the App ---
const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<App />);
}
