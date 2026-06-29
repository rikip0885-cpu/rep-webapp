import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { 
  useListMessages, 
  useGetConversation, 
  useCreateConversation,
  getListMessagesQueryKey, 
  getListConversationsQueryKey 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

export function ChatContent({ conversationId }: { conversationId: number | null }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  const { data: initialMessages, isLoading: messagesLoading } = useListMessages(conversationId!, {
    query: { enabled: !!conversationId, queryKey: getListMessagesQueryKey(conversationId ?? 0) }
  });
  const { data: conversation } = useGetConversation(conversationId!, {
    query: { enabled: !!conversationId }
  });

  const createConversation = useCreateConversation();

  const [localMessages, setLocalMessages] = useState<any[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedResponse, setStreamedResponse] = useState("");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialMessages && !isStreaming) {
      setLocalMessages(initialMessages);
    } else if (!conversationId) {
      setLocalMessages([]);
      setInputValue("");
    }
  }, [initialMessages, conversationId, isStreaming]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages, streamedResponse]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [inputValue]);

  const sendStream = async (targetConvId: number, content: string) => {
    try {
      const streamRes = await fetch(`/api/conversations/${targetConvId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });

      if (!streamRes.ok) {
        const errText = await streamRes.text();
        throw new Error(`Server error ${streamRes.status}: ${errText}`);
      }
      if (!streamRes.body) throw new Error("No response body");

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let buffer = '';
      let fullResponse = '';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          let newlineIndex;
          while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6);
              try {
                const data = JSON.parse(dataStr);
                if (data.done) {
                  // Done
                } else if (data.content) {
                  fullResponse += data.content;
                  setStreamedResponse(fullResponse);
                }
              } catch (e) {
                // partial JSON, ignore
              }
            }
          }
        }
      }

      setLocalMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: "assistant",
        content: fullResponse,
        createdAt: new Date().toISOString()
      }]);
      setStreamedResponse("");
      
      queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(targetConvId) });
      queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });

    } catch (error) {
      console.error("Stream failed:", error);
      setLocalMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: "assistant",
        content: "Sorry, something went wrong. Please try again.",
        createdAt: new Date().toISOString()
      }]);
      setStreamedResponse("");
    } finally {
      setIsStreaming(false);
    }
  };

  const createAndSend = async (content: string) => {
    setIsStreaming(true);
    
    // Optimistic user message
    const tempUserMsg = {
      id: Date.now(),
      role: "user",
      content,
      createdAt: new Date().toISOString()
    };
    setLocalMessages(prev => [...prev, tempUserMsg]);
    setInputValue("");
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    if (!conversationId) {
      createConversation.mutate({ data: { title: content.slice(0, 30) + (content.length > 30 ? '...' : '') } }, {
        onSuccess: (conv) => {
          setLocation(`/c/${conv.id}`, { replace: true });
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
          sendStream(conv.id, content);
        },
        onError: () => {
          setIsStreaming(false);
        }
      });
    } else {
      await sendStream(conversationId, content);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputValue.trim() && !isStreaming) {
        createAndSend(inputValue.trim());
      }
    }
  };

  const isInitialLoading = !!conversationId && messagesLoading && localMessages.length === 0;

  return (
    <div className="flex-1 flex flex-col h-full relative">
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 scroll-smooth">
        <div className="max-w-3xl mx-auto w-full flex flex-col gap-8 pb-12">
          
          {!conversationId && localMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-1000 ease-out">
              <h2 className="font-serif text-4xl md:text-5xl text-primary font-medium tracking-tight">
                What's on your mind?
              </h2>
              <p className="text-muted-foreground text-lg max-w-md">
                A quiet space to think out loud. I'll listen, remember, and help you find clarity.
              </p>
            </div>
          ) : isInitialLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <>
              {localMessages.map((msg, i) => (
                <div 
                  key={msg.id} 
                  className={cn(
                    "flex flex-col max-w-[85%] animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out",
                    msg.role === "user" ? "self-end items-end" : "self-start items-start"
                  )}
                  style={{ animationFillMode: 'both', animationDelay: `${i * 50}ms` }}
                >
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <span className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
                      {msg.role === "user" ? "You" : "Aura"}
                    </span>
                  </div>
                  <div className={cn(
                    "px-5 py-4 rounded-2xl text-[15px] leading-relaxed shadow-sm",
                    msg.role === "user" 
                      ? "bg-primary text-primary-foreground rounded-br-sm" 
                      : "bg-card border border-card-border text-card-foreground rounded-bl-sm prose prose-sm md:prose-base prose-p:leading-relaxed prose-pre:bg-muted prose-pre:text-foreground prose-a:text-primary max-w-none"
                  )}>
                    {msg.role === "user" ? (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    ) : (
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    )}
                  </div>
                </div>
              ))}
              
              {streamedResponse && (
                <div className="flex flex-col max-w-[85%] self-start items-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <span className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
                      Aura
                    </span>
                    <Loader2 className="w-3 h-3 animate-spin text-primary" />
                  </div>
                  <div className="px-5 py-4 rounded-2xl text-[15px] leading-relaxed shadow-sm bg-card border border-card-border text-card-foreground rounded-bl-sm prose prose-sm md:prose-base prose-p:leading-relaxed prose-pre:bg-muted prose-pre:text-foreground max-w-none">
                    <ReactMarkdown>{streamedResponse}</ReactMarkdown>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="p-4 md:p-6 bg-gradient-to-t from-background via-background to-transparent pt-10">
        <div className="max-w-3xl mx-auto relative group">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Share a thought..."
            className="w-full bg-card border-2 border-card-border focus:border-primary/50 text-foreground placeholder:text-muted-foreground/60 rounded-2xl pl-5 pr-14 py-4 focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all resize-none overflow-hidden shadow-sm shadow-card-border/50 text-[15px]"
            rows={1}
            disabled={isStreaming}
          />
          <button
            onClick={() => inputValue.trim() && !isStreaming && createAndSend(inputValue.trim())}
            disabled={!inputValue.trim() || isStreaming}
            className="absolute right-3 bottom-3 p-2.5 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-50 disabled:hover:bg-primary/10 disabled:hover:text-primary rounded-xl transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="text-center mt-3 text-xs text-muted-foreground/60">
          Press <kbd className="font-sans px-1.5 py-0.5 bg-muted rounded border border-border">Enter</kbd> to send, <kbd className="font-sans px-1.5 py-0.5 bg-muted rounded border border-border">Shift + Enter</kbd> for new line
        </div>
      </div>
    </div>
  );
}
