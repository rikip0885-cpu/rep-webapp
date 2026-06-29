import { Link, useLocation } from "wouter";
import { useListConversations, useDeleteConversation, getListConversationsQueryKey } from "@workspace/api-client-react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";

export function Sidebar({ currentId, onClose }: { currentId: number | null; onClose: () => void }) {
  const { data: conversations, isLoading } = useListConversations();
  const deleteMutation = useDeleteConversation();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.setQueryData(getListConversationsQueryKey(), (old: any) => 
          old?.filter((c: any) => c.id !== id)
        );
        if (currentId === id) {
          setLocation("/");
        }
      }
    });
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (isToday(date)) return format(date, "h:mm a");
    if (isYesterday(date)) return "Yesterday";
    return format(date, "MMM d");
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 md:p-6 pb-2">
        <h1 className="font-serif text-2xl mb-6 text-foreground hidden md:block tracking-wide">
          Aura
        </h1>
        <Link 
          href="/"
          onClick={onClose}
          className="flex items-center gap-3 w-full px-4 py-3 bg-primary/10 text-primary hover:bg-primary/15 transition-colors rounded-xl font-medium"
        >
          <Plus className="w-4 h-4" />
          <span>New Thought</span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-2 md:px-4 pb-4 space-y-1">
        {isLoading ? (
          <div className="flex items-center justify-center p-8 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : !conversations?.length ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground font-serif italic">
            No thoughts yet.
          </div>
        ) : (
          conversations.map((conv) => (
            <Link
              key={conv.id}
              href={`/c/${conv.id}`}
              onClick={onClose}
              className={cn(
                "group flex flex-col gap-1 p-3 rounded-xl transition-all relative overflow-hidden",
                currentId === conv.id 
                  ? "bg-card shadow-sm border border-card-border" 
                  : "hover:bg-sidebar-accent border border-transparent"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm truncate text-foreground pr-6">
                  {conv.title || "Untitled Thought"}
                </span>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                  {formatDate(conv.updatedAt)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate opacity-80">
                {conv.lastMessage || "Empty space"}
              </p>
              
              <button
                onClick={(e) => handleDelete(conv.id, e)}
                className="absolute right-2 top-2.5 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all bg-background/50 backdrop-blur-sm"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
