'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Monitor, Edit, Trash2, Copy, CheckCircle, XCircle, AlertCircle, RefreshCw, AlertTriangle, Check, MonitorPlay } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import DisplayModal from '@/components/displays/DisplayModal';
import { Display, DisplayStatus } from '@/types/display';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { useCSRF } from '@/hooks/useCSRF';

export default function DisplaysPage() {
  const { user: currentUser, loading: authLoading } = useAuth();
  const { secureFetch } = useCSRF();
  const router = useRouter();
  const [displays, setDisplays] = useState<Display[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedDisplay, setSelectedDisplay] = useState<Display | null>(null);
  const [copiedDisplayId, setCopiedDisplayId] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [displayToDelete, setDisplayToDelete] = useState<{ id: string; name: string } | null>(null);

  // Check auth and fetch displays
  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) {
      router.push('/auth/login');
      return;
    }
    if (!currentUser.permissions?.includes('DISPLAY_CONTROL')) {
      router.push('/unauthorized');
      return;
    }
    fetchDisplays();
    // Refresh status every 30 seconds
    const interval = setInterval(fetchDisplays, 30000);
    return () => clearInterval(interval);
  }, [currentUser, authLoading, router]);

  const fetchDisplays = async () => {
    try {
      const response = await fetch('/api/displays', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
      });
      if (response.ok) {
        const data = await response.json();
        // The API already returns frontend Display format from displayService
        // No need to transform again
        const displays = Array.isArray(data) ? data : [];
        
        setDisplays(displays);
      }
    } catch (error) {
      console.error('Failed to fetch displays:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDisplay = () => {
    setSelectedDisplay(null);
    setShowModal(true);
  };

  const handleEditDisplay = (display: Display) => {
    setSelectedDisplay(display);
    setShowModal(true);
  };

  const handleDeleteClick = (display: Display) => {
    setDisplayToDelete({ id: display.id, name: display.name });
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!displayToDelete) return;
    
    setDeleteConfirmOpen(false);
    
    try {
      const response = await secureFetch(`/api/displays/${displayToDelete.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchDisplays();
      }
    } catch (error) {
      console.error('Failed to delete display:', error);
    }
    
    setDisplayToDelete(null);
  };

  const handleCopyUrl = async (display: Display) => {
    try {
      console.log('Display object:', display);
      console.log('Display uniqueUrl:', display.uniqueUrl);
      console.log('Display urlSlug:', (display as any).urlSlug);
      
      const url = `${window.location.origin}/display/${display.uniqueUrl}`;
      console.log('Generated URL:', url);

      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = url;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      
      // Show checkmark feedback and URL
      setCopiedDisplayId(display.id);
      setCopiedUrl(url);
      setTimeout(() => {
        setCopiedDisplayId(null);
        setCopiedUrl(null);
      }, 3000);
    } catch (error) {
      console.error('Failed to copy URL:', error);
    }
  };

  const getStatusIcon = (status: DisplayStatus | 'unknown') => {
    switch (status) {
      case 'online':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'offline':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      case 'unknown':
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: DisplayStatus | 'unknown') => {
    switch (status) {
      case 'online':
        return 'text-green-500';
      case 'offline':
        return 'text-red-500';
      case 'error':
        return 'text-yellow-500';
      case 'unknown':
      default:
        return 'text-gray-500';
    }
  };

  const filteredDisplays = displays.filter(display =>
    display.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    display.location?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-brand-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <MonitorPlay className="w-12 h-12 text-brand-orange-500" />
          <div>
            <h1 className="text-4xl font-bold text-white uppercase tracking-wide font-['Made_Tommy']">Display Management</h1>
            <p className="text-white/70">Configure and monitor your digital signage displays</p>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="flex justify-between items-center mb-6">
          <div className="relative w-96">
            <Input
              type="text"
              placeholder="Search displays..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
            />
          </div>

          <div className="flex gap-3">
            <Button
              onClick={fetchDisplays}
              variant="ghost"
              className="text-white hover:bg-white/10"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button
              onClick={handleCreateDisplay}
              className="bg-brand-orange-500 hover:bg-brand-orange-600 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Display
            </Button>
          </div>
        </div>

        {/* Display Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDisplays.map((display) => (
            <Card key={display.id} className="glass-card border-white/20 hover:bg-white/10 transition-all duration-200">
              <CardContent className="p-6">
                {/* Status Badge */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Monitor className="w-5 h-5 text-white/70" />
                    <span className={`text-sm font-medium ${getStatusColor(display.status || 'unknown')}`}>
                      {(display.status?.toUpperCase?.() || 'UNKNOWN')}
                    </span>
                  </div>
                  {getStatusIcon(display.status || 'unknown')}
                </div>

                {/* Display Info */}
                <h3 className="text-xl font-semibold text-white mb-2">{display.name}</h3>
                {display.location && (
                  <p className="text-white/70 text-sm mb-3">{display.location}</p>
                )}

                {/* Details */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-white/50">Resolution:</span>
                    <span className="text-white">{display.resolution}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">Orientation:</span>
                    <span className="text-white">{(display.orientation || 'LANDSCAPE').toLowerCase()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">Playlist:</span>
                    <span className={display.assignedPlaylist ? "text-white" : "text-yellow-500"}>
                      {display.assignedPlaylist?.name || 'No playlist assigned'}
                    </span>
                  </div>
                  {display.lastSeen && (
                    <div className="flex justify-between">
                      <span className="text-white/50">Last Seen:</span>
                      <span className="text-white">
                        {formatDistanceToNow(new Date(display.lastSeen), { addSuffix: true })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-4 pt-4 border-t border-white/10">
                  <Button
                    onClick={() => handleCopyUrl(display)}
                    variant="ghost"
                    size="sm"
                    className="text-white hover:bg-white/10 flex-1"
                    title="Copy display URL"
                  >
                    {copiedDisplayId === display.id ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    onClick={() => handleEditDisplay(display)}
                    variant="ghost"
                    size="sm"
                    className="text-white hover:bg-white/10 flex-1"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    onClick={() => handleDeleteClick(display)}
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:bg-red-500/10 flex-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredDisplays.length === 0 && (
          <div className="text-center py-12">
            <Monitor className="w-16 h-16 text-white/30 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">
              {searchQuery ? 'No displays found' : 'No displays yet'}
            </h3>
            <p className="text-white/50 mb-6">
              {searchQuery
                ? 'Try adjusting your search query'
                : 'Create your first display to get started'}
            </p>
            {!searchQuery && (
              <Button
                onClick={handleCreateDisplay}
                className="bg-brand-orange-500 hover:bg-brand-orange-600 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Display
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Display Modal */}
      {showModal && (
        <DisplayModal
          display={selectedDisplay}
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onSave={() => {
            setShowModal(false);
            fetchDisplays();
          }}
        />
      )}


      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="bg-red-500/20 backdrop-blur-md border-red-500/50 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-white text-lg">
              <AlertTriangle className="w-6 h-6 text-orange-500" />
              <span style={{ 
                fontFamily: 'Made Tommy, sans-serif', 
                fontWeight: 'bold', 
                textTransform: 'uppercase', 
                letterSpacing: '0.01em' 
              }}>
                Delete Display
              </span>
            </AlertDialogTitle>
            <AlertDialogDescription className="text-red-300 pt-2 font-body">
              Are you sure you want to delete "{displayToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              className="text-white hover:bg-white/10 hover:text-white font-body"
              onClick={() => setDisplayToDelete(null)}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700 text-white font-body"
            >
              Delete Display
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Copy Success Toast */}
      {copiedUrl && (
        <div className="fixed bottom-4 right-4 z-50 px-4 py-3 bg-green-500/90 backdrop-blur-md text-white rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom max-w-md">
          <div className="flex items-center gap-3">
            <Check className="w-5 h-5" />
            <div>
              <p className="font-semibold">URL Copied!</p>
              <p className="text-sm text-white/90 truncate">{copiedUrl}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
