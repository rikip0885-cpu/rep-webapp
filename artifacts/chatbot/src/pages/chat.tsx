import { Sidebar } from "@/components/sidebar";
import { ChatContent } from "@/components/chat-content";
import { useRoute } from "wouter";
import { useState } from "react";
import { Menu } from "lucide-react";

export default function ChatPage() {
  const [match, params] = useRoute("/c/:id");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const conversationId = match ? Number(params.id) : null;

  return (
    <div className="flex h-[100dvh] bg-background text-foreground overflow-hidden font-sans selection:bg-primary/20">
      <div 
        className={`fixed inset-0 z-40 md:hidden bg-background/80 backdrop-blur-sm transition-opacity ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
        onClick={() => setSidebarOpen(false)} 
      />
      
      <div className={`fixed inset-y-0 left-0 z-50 w-72 md:w-[320px] bg-sidebar border-r border-sidebar-border transform transition-transform duration-300 md:relative md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
         <Sidebar currentId={conversationId} onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col min-w-0 bg-background relative shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.05)]">
        <header className="md:hidden flex items-center justify-between p-4 bg-background z-10">
          <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors">
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-serif text-lg tracking-wide text-primary">Aura</span>
          <div className="w-9" />
        </header>

        <ChatContent conversationId={conversationId} />
      </div>
    </div>
  );
}
