import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import {
  Users, DollarSign, Shield, AlertTriangle, Activity,
  ArrowLeft, Sparkles, CheckCircle, XCircle, Eye,
  TrendingUp, MessageSquare, Video, Crown, Settings, Lock, Server,
  FileText, Globe, Plus, Trash2, Edit2, ExternalLink
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { token } = useAuth();

  const [stats, setStats] = useState(null);
  const [reports, setReports] = useState([]);
  const [moderationLogs, setModerationLogs] = useState([]);
  const [settings, setSettings] = useState(null);
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Page Editing State
  const [isPageModalOpen, setIsPageModalOpen] = useState(false);
  const [editingPage, setEditingPage] = useState(null);

  useEffect(() => {
    fetchData();

    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, reportsRes, logsRes, settingsRes, pagesRes] = await Promise.all([
        fetch(`${API}/api/admin/stats`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API}/api/admin/reports?status=pending`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API}/api/admin/moderation-logs?limit=50`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API}/api/admin/settings`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API}/api/admin/pages`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (reportsRes.ok) setReports(await reportsRes.json());
      if (logsRes.ok) setModerationLogs(await logsRes.json());
      if (settingsRes.ok) setSettings(await settingsRes.json());
      if (pagesRes.ok) setPages(await pagesRes.json());
    } catch (error) {
      console.error('Failed to fetch admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveReport = async (reportId, action) => {
    try {
      await fetch(`${API}/api/admin/reports/${reportId}/resolve?action=${action}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      toast.success(`Report ${action === 'dismiss' ? 'dismissed' : action === 'ban' ? 'user banned' : 'warning sent'}`);
      fetchData();
    } catch (error) {
      toast.error('Failed to resolve report');
    }
  };

  const handleSettingsSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/admin/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(settings)
      });

      if (res.ok) {
        toast.success('Settings saved successfully');
        const settingsRes = await fetch(`${API}/api/admin/settings`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (settingsRes.ok) setSettings(await settingsRes.json());
      } else {
        toast.error('Failed to save settings');
      }
    } catch (error) {
      toast.error('Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  const handlePageSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/admin/pages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(editingPage)
      });

      if (res.ok) {
        toast.success('Page saved successfully');
        setIsPageModalOpen(false);
        setEditingPage(null);
        fetchData();
      } else {
        toast.error('Failed to save page');
      }
    } catch (error) {
      toast.error('Error saving page');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePage = async (pageId) => {
    if (!window.confirm('Are you sure you want to delete this page?')) return;
    try {
      const res = await fetch(`${API}/api/admin/pages/${pageId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success('Page deleted');
        fetchData();
      } else {
        toast.error('Failed to delete page');
      }
    } catch (error) {
      toast.error('Error deleting page');
    }
  };

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const openNewPageModal = () => {
    setEditingPage({
      title: '',
      slug: '',
      content: '',
      published: true,
      meta_title: '',
      meta_description: ''
    });
    setIsPageModalOpen(true);
  };

  const openEditPageModal = (page) => {
    setEditingPage(page);
    setIsPageModalOpen(true);
  };

  const statCards = [
    { label: 'Total Users', value: stats?.total_users || 0, icon: Users, color: 'from-[#6366f1] to-[#4f46e5]' },
    { label: 'Premium Users', value: stats?.premium_users || 0, icon: Crown, color: 'from-[#d946ef] to-[#9333ea]' },
    { label: 'Online Now', value: stats?.online_now || 0, icon: Activity, color: 'from-[#22d3ee] to-[#0891b2]' },
    { label: 'Queue Size', value: stats?.active_queue || 0, icon: Users, color: 'from-[#f59e0b] to-[#d97706]' },
    { label: 'Revenue', value: `$${(stats?.total_revenue || 0).toFixed(2)}`, icon: DollarSign, color: 'from-[#10b981] to-[#059669]' },
    { label: 'Pending Reports', value: stats?.pending_reports || 0, icon: AlertTriangle, color: 'from-[#ef4444] to-[#dc2626]' },
    { label: 'Total Sessions', value: stats?.total_sessions || 0, icon: Video, color: 'from-[#8b5cf6] to-[#7c3aed]' },
    { label: 'Flagged Content', value: stats?.flagged_content || 0, icon: Shield, color: 'from-[#f97316] to-[#ea580c]' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-[#6366f1]/20 flex items-center justify-center animate-pulse">
            <Activity className="w-8 h-8 text-[#6366f1]" />
          </div>
          <p className="text-slate-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505]">
      {/* Header */}
      <header className="glass px-6 py-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            data-testid="back-btn"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6366f1] to-[#4f46e5] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold font-['Syne']">Admin Dashboard</span>
          </div>

          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
            <span className="status-indicator online mr-2" />
            Live
          </Badge>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Stats Grid */}
        <section>
          <h2 className="text-xl font-bold font-['Syne'] mb-6">Platform Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statCards.map((stat, i) => (
              <div
                key={i}
                className="stat-card"
                data-testid={`stat-${stat.label.toLowerCase().replace(/\s/g, '-')}`}
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-r ${stat.color} flex items-center justify-center mb-4`}>
                  <stat.icon className="w-5 h-5 text-white" />
                </div>
                <p className="text-sm text-slate-400">{stat.label}</p>
                <p className="text-2xl font-bold mt-1">{stat.value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Tabs */}
        <Tabs defaultValue="reports" className="space-y-6">
          <TabsList className="glass bg-black/40 p-1 rounded-full flex flex-wrap h-auto gap-1">
            <TabsTrigger
              value="reports"
              className="rounded-full data-[state=active]:bg-[#6366f1] data-[state=active]:text-white flex-1"
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              Reports
            </TabsTrigger>
            <TabsTrigger
              value="moderation"
              className="rounded-full data-[state=active]:bg-[#6366f1] data-[state=active]:text-white flex-1"
            >
              <Shield className="w-4 h-4 mr-2" />
              Moderation
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className="rounded-full data-[state=active]:bg-[#6366f1] data-[state=active]:text-white flex-1"
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </TabsTrigger>
            <TabsTrigger
              value="cms"
              className="rounded-full data-[state=active]:bg-[#6366f1] data-[state=active]:text-white flex-1"
            >
              <Globe className="w-4 h-4 mr-2" />
              CMS & SEO
            </TabsTrigger>
          </TabsList>

          {/* Reports Tab */}
          <TabsContent value="reports">
            <div className="glass rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-white/10">
                <h3 className="font-semibold">Pending Reports ({reports.length})</h3>
              </div>

              <ScrollArea className="h-[400px]">
                {reports.length === 0 ? (
                  <div className="p-8 text-center">
                    <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                    <p className="text-slate-400">No pending reports</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {reports.map((report) => (
                      <div key={report.id} className="p-4 hover:bg-white/5 transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="border-red-500/30 text-red-400">
                                {report.reason}
                              </Badge>
                              <span className="text-xs text-slate-500">
                                {new Date(report.created_at).toLocaleString()}
                              </span>
                            </div>
                            {report.description && (
                              <p className="text-sm text-slate-400">{report.description}</p>
                            )}
                            <p className="text-xs text-slate-500">
                              Reporter: {report.reporter_id?.slice(0, 8)}... |
                              Reported: {report.reported_user_id?.slice(0, 8)}...
                            </p>
                          </div>

                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" onClick={() => handleResolveReport(report.id, 'dismiss')}>Dismiss</Button>
                            <Button size="sm" variant="ghost" onClick={() => handleResolveReport(report.id, 'warn')} className="text-yellow-400">Warn</Button>
                            <Button size="sm" variant="destructive" onClick={() => handleResolveReport(report.id, 'ban')}>Ban</Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>

          {/* Moderation Tab */}
          <TabsContent value="moderation">
            <div className="glass rounded-2xl overflow-hidden">
              {/* ... (Existing Moderation UI) ... */}
              <div className="p-4 border-b border-white/10">
                <h3 className="font-semibold">AI Moderation Logs</h3>
              </div>
              <ScrollArea className="h-[400px]">
                {moderationLogs.length === 0 ? (
                  <div className="p-8 text-center">
                    <Shield className="w-12 h-12 text-[#6366f1] mx-auto mb-4" />
                    <p className="text-slate-400">No moderation logs yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {moderationLogs.map((log) => (
                      <div key={log.id} className="p-4 hover:bg-white/5 transition-colors">
                        <div className="flex items-center justify-between">
                          <div>
                            <Badge className={log.result?.is_safe ? 'bg-green-500/20' : 'bg-red-500/20'}>
                              {log.result?.is_safe ? 'Safe' : 'Flagged'}
                            </Badge>
                            <span className="text-sm text-slate-400 ml-2">{log.content_preview}</span>
                          </div>
                          <span className="text-xs text-slate-500">{new Date(log.created_at).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <div className="grid gap-6">
              <form onSubmit={handleSettingsSave} className="space-y-6">

                {/* General Settings */}
                <Card className="glass border-white/10">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Server className="w-5 h-5 text-[#6366f1]" /> General Configuration</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
                      <Label>Registration</Label>
                      <Switch checked={settings?.enable_registrations || false} onCheckedChange={(c) => updateSetting('enable_registrations', c)} />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
                      <Label>Email Verification</Label>
                      <Switch checked={settings?.enable_email_verification || false} onCheckedChange={(c) => updateSetting('enable_email_verification', c)} />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-red-500/20">
                      <Label className="text-red-400">Maintenance Mode</Label>
                      <Switch checked={settings?.maintenance_mode || false} onCheckedChange={(c) => updateSetting('maintenance_mode', c)} />
                    </div>
                  </CardContent>
                </Card>

                {/* Email Settings */}
                <Card className="glass border-white/10">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><MessageSquare className="w-5 h-5 text-[#22d3ee]" /> SMTP Configuration</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Host</Label><Input value={settings?.smtp_host || ''} onChange={(e) => updateSetting('smtp_host', e.target.value)} className="bg-black/50" /></div>
                    <div className="space-y-2"><Label>Port</Label><Input type="number" value={settings?.smtp_port || ''} onChange={(e) => updateSetting('smtp_port', parseInt(e.target.value))} className="bg-black/50" /></div>
                    <div className="space-y-2"><Label>User</Label><Input value={settings?.smtp_user || ''} onChange={(e) => updateSetting('smtp_user', e.target.value)} className="bg-black/50" /></div>
                    <div className="space-y-2"><Label>Password</Label><Input type="password" value={settings?.smtp_password || ''} onChange={(e) => updateSetting('smtp_password', e.target.value)} className="bg-black/50" placeholder={settings?.smtp_password ? "********" : "Entropy"} /></div>
                  </CardContent>
                </Card>

                <div className="flex justify-end"><Button type="submit" disabled={saving}>Save Changes</Button></div>
              </form>
            </div>
          </TabsContent>

          {/* CMS & SEO Tab */}
          <TabsContent value="cms">
            <div className="grid gap-6">
              {/* Global SEO */}
              <Card className="glass border-white/10">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Globe className="w-5 h-5 text-blue-400" /> Global SEO Settings</CardTitle>
                  <CardDescription>Default meta tags for your site</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Site Title</Label>
                    <Input value={settings?.site_title || ''} onChange={e => updateSetting('site_title', e.target.value)} className="bg-black/50" />
                  </div>
                  <div className="space-y-2">
                    <Label>Site Description</Label>
                    <Textarea value={settings?.site_description || ''} onChange={e => updateSetting('site_description', e.target.value)} className="bg-black/50" />
                  </div>
                  <div className="space-y-2">
                    <Label>Keywords</Label>
                    <Input value={settings?.site_keywords || ''} onChange={e => updateSetting('site_keywords', e.target.value)} className="bg-black/50" placeholder="comma, separated, keys" />
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button onClick={handleSettingsSave} disabled={saving} size="sm" variant="outline" className="border-blue-500/30 text-blue-400">Save Global SEO</Button>
                  </div>
                </CardContent>
              </Card>

              {/* Pages Management */}
              <Card className="glass border-white/10">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-emerald-400" /> Content Pages</CardTitle>
                    <CardDescription>Manage static pages like Privacy, Terms, and Blogs</CardDescription>
                  </div>
                  <Button onClick={openNewPageModal} size="sm" className="bg-emerald-600 hover:bg-emerald-700"><Plus className="w-4 h-4 mr-1" /> Add Page</Button>
                </CardHeader>
                <CardContent>
                  {pages.length === 0 ? (
                    <div className="text-center p-8 border border-dashed border-white/20 rounded-xl">
                      <FileText className="w-8 h-8 mx-auto text-slate-500 mb-2" />
                      <p className="text-slate-400">No pages yet</p>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {pages.map(page => (
                        <div key={page.id} className="flex items-center justify-between p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                              <FileText className="w-5 h-5 text-emerald-400" />
                            </div>
                            <div>
                              <h4 className="font-medium">{page.title}</h4>
                              <div className="flex items-center gap-2 text-xs text-slate-400">
                                <Badge variant="outline" className="text-[10px] h-5 border-white/10">/{page.slug}</Badge>
                                <span>Updated {new Date(page.updated_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-400" onClick={() => openEditPageModal(page)}><Edit2 className="w-4 h-4" /></Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400" onClick={() => handleDeletePage(page.id)}><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

        </Tabs>
      </main>

      {/* Page Edit Modal */}
      <Dialog open={isPageModalOpen} onOpenChange={setIsPageModalOpen}>
        <DialogContent className="glass border-white/10 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPage?.id ? 'Edit Page' : 'Create New Page'}</DialogTitle>
          </DialogHeader>

          {editingPage && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Page Title</Label>
                  <Input
                    value={editingPage.title}
                    onChange={e => setEditingPage(curr => ({ ...curr, title: e.target.value }))}
                    className="bg-black/50"
                    placeholder="e.g. Privacy Policy"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Slug (URL)</Label>
                  <Input
                    value={editingPage.slug}
                    onChange={e => setEditingPage(curr => ({ ...curr, slug: e.target.value }))}
                    className="bg-black/50"
                    placeholder="e.g. privacy-policy"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Content (HTML/Markdown)</Label>
                <Textarea
                  value={editingPage.content}
                  onChange={e => setEditingPage(curr => ({ ...curr, content: e.target.value }))}
                  className="bg-black/50 min-h-[200px] font-mono text-sm"
                  placeholder="<h1>Page Title</h1><p>Content goes here...</p>"
                />
              </div>

              <div className="space-y-4 p-4 border border-white/10 rounded-xl bg-black/20">
                <h4 className="font-medium text-sm text-slate-400 mb-2">SEO Overrides</h4>
                <div className="space-y-2">
                  <Label className="text-xs">Meta Title</Label>
                  <Input
                    value={editingPage.meta_title || ''}
                    onChange={e => setEditingPage(curr => ({ ...curr, meta_title: e.target.value }))}
                    className="bg-black/50 h-8 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Meta Description</Label>
                  <Input
                    value={editingPage.meta_description || ''}
                    onChange={e => setEditingPage(curr => ({ ...curr, meta_description: e.target.value }))}
                    className="bg-black/50 h-8 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsPageModalOpen(false)}>Cancel</Button>
            <Button onClick={handlePageSave} className="bg-emerald-600 hover:bg-emerald-700">{saving ? 'Saving...' : 'Save Page'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
