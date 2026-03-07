import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { UserPlus, MoreHorizontal, Mail, Shield, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: "admin" | "editor";
  status: "active" | "pending";
  avatarInitial: string;
}

export default function Team() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "admin">("editor");

  // Current user as owner + placeholder members
  const [members, setMembers] = useState<TeamMember[]>([
    {
      id: "owner",
      email: user?.email || "you@example.com",
      name: user?.user_metadata?.full_name || "You",
      role: "admin",
      status: "active",
      avatarInitial: (user?.email?.[0] || "Y").toUpperCase(),
    },
  ]);

  const handleInvite = () => {
    if (!inviteEmail.trim()) return;

    const newMember: TeamMember = {
      id: crypto.randomUUID(),
      email: inviteEmail,
      name: inviteEmail.split("@")[0],
      role: inviteRole,
      status: "pending",
      avatarInitial: inviteEmail[0].toUpperCase(),
    };

    setMembers((prev) => [...prev, newMember]);
    setInviteEmail("");
    setInviteRole("editor");
    setShowInviteDialog(false);

    toast({
      title: "Invite sent",
      description: `Invitation sent to ${inviteEmail}`,
    });
  };

  const handleRemoveMember = (id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
    toast({ title: "Member removed" });
  };

  const handleChangeRole = (id: string, role: "admin" | "editor") => {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, role } : m))
    );
    toast({ title: "Role updated" });
  };

  return (
    <DashboardLayout>
      <div className="p-8 max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Team</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage who has access to your account
            </p>
          </div>
          <Button variant="hero" onClick={() => setShowInviteDialog(true)}>
            <UserPlus className="w-4 h-4" />
            Invite member
          </Button>
        </div>

        {/* Members List */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-sm font-medium text-muted-foreground">
              {members.length} member{members.length !== 1 ? "s" : ""}
            </h2>
          </div>
          <div className="divide-y divide-border">
            {members.map((member) => (
              <div
                key={member.id}
                className="px-6 py-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    {member.avatarInitial}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {member.name}
                      </p>
                      {member.status === "pending" && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-warning/10 text-warning-foreground font-medium">
                          Pending
                        </span>
                      )}
                      {member.id === "owner" && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                          Owner
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {member.email}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground capitalize flex items-center gap-1">
                    {member.role === "admin" ? (
                      <Shield className="w-3 h-3" />
                    ) : (
                      <Pencil className="w-3 h-3" />
                    )}
                    {member.role}
                  </span>

                  {member.id !== "owner" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            handleChangeRole(
                              member.id,
                              member.role === "admin" ? "editor" : "admin"
                            )
                          }
                        >
                          <Shield className="w-4 h-4 mr-2" />
                          Make {member.role === "admin" ? "Editor" : "Admin"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleRemoveMember(member.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Roles explanation */}
        <div className="mt-6 grid sm:grid-cols-2 gap-4">
          <div className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Admin</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Full access to create videos, manage team members, view billing, and change settings.
            </p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center gap-2 mb-2">
              <Pencil className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Editor</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Can create and manage videos, but cannot invite members, access billing, or change account settings.
            </p>
          </div>
        </div>
      </div>

      {/* Invite Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite team member</DialogTitle>
            <DialogDescription>
              Send an invitation to collaborate on your account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="colleague@agency.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="pl-10 h-11"
                  onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "editor" | "admin")}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">
                    Editor — can create and manage videos
                  </SelectItem>
                  <SelectItem value="admin">
                    Admin — full access including billing and team
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
                Cancel
              </Button>
              <Button variant="hero" onClick={handleInvite} disabled={!inviteEmail.trim()}>
                Send invite
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
