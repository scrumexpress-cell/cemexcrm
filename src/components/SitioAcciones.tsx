// Acciones avanzadas del sitio: reasignar vendedor y compartir link público.

import { useEffect, useState } from "react";
import { Copy, Link2, Share2, UserCog, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  supabase,
  type Profile,
  type SitioShare,
} from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

interface Props {
  sitioId: string;
  vendedorId: string | null;
  nombre: string | null;
  onReassigned?: () => void;
}

export function SitioAcciones({
  sitioId,
  vendedorId,
  nombre,
  onReassigned,
}: Props) {
  const { profile, user } = useAuth();
  const [reassignOpen, setReassignOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const puedeReasignar =
    profile?.role === "gerente" || profile?.role === "head";
  const puedeCompartir =
    user?.id === vendedorId ||
    profile?.role === "gerente" ||
    profile?.role === "head";

  return (
    <div className="flex flex-wrap gap-2">
      {puedeCompartir && (
        <Button
          size="sm"
          variant="outline"
          className="h-9"
          onClick={() => setShareOpen(true)}
        >
          <Share2 className="h-4 w-4 mr-1" /> Compartir
        </Button>
      )}
      {puedeReasignar && (
        <Button
          size="sm"
          variant="outline"
          className="h-9"
          onClick={() => setReassignOpen(true)}
        >
          <UserCog className="h-4 w-4 mr-1" /> Reasignar
        </Button>
      )}

      {puedeReasignar && (
        <ReassignDialog
          open={reassignOpen}
          onOpenChange={setReassignOpen}
          sitioId={sitioId}
          actualVendedorId={vendedorId}
          onDone={() => {
            setReassignOpen(false);
            onReassigned?.();
          }}
        />
      )}
      {puedeCompartir && (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          sitioId={sitioId}
          nombre={nombre}
        />
      )}
    </div>
  );
}

function ReassignDialog({
  open,
  onOpenChange,
  sitioId,
  actualVendedorId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sitioId: string;
  actualVendedorId: string | null;
  onDone: () => void;
}) {
  const [vendedores, setVendedores] = useState<Profile[]>([]);
  const [nuevoVend, setNuevoVend] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void supabase
      .from("profiles")
      .select("*")
      .eq("role", "vendedor")
      .order("nombre", { ascending: true })
      .then(({ data }) => setVendedores((data as Profile[]) ?? []));
  }, [open]);

  async function submit() {
    if (!nuevoVend) {
      toast.error("Elige un vendedor");
      return;
    }
    if (nuevoVend === actualVendedorId) {
      toast.error("Ese vendedor ya tiene el sitio");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("reasignar_sitio", {
      p_sitio_id: sitioId,
      p_nuevo_vendedor: nuevoVend,
      p_motivo: motivo.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Sitio reasignado");
    setNuevoVend("");
    setMotivo("");
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reasignar sitio</DialogTitle>
          <DialogDescription className="text-xs">
            El nuevo dueño recibirá una alerta. El vendedor anterior también.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nuevo vendedor</Label>
            <Select value={nuevoVend} onValueChange={setNuevoVend}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Elige un vendedor" />
              </SelectTrigger>
              <SelectContent>
                {vendedores.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.nombre ?? v.email ?? v.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Motivo (opcional)</Label>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. cambio de zona"
              className="h-10"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            className="flex-1 h-11"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button className="flex-1 h-11" onClick={submit} disabled={saving}>
            {saving ? "Reasignando..." : "Reasignar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShareDialog({
  open,
  onOpenChange,
  sitioId,
  nombre,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sitioId: string;
  nombre: string | null;
}) {
  const { user } = useAuth();
  const [share, setShare] = useState<SitioShare | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("sitio_shares")
      .select("*")
      .eq("sitio_id", sitioId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setShare((data as SitioShare | null) ?? null);
    setLoading(false);
  }

  async function generar() {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("sitio_shares")
      .insert({ sitio_id: sitioId, creado_por: user.id })
      .select()
      .single();
    setLoading(false);
    if (error || !data) {
      toast.error(error?.message ?? "No se pudo crear el link");
      return;
    }
    setShare(data as SitioShare);
  }

  async function revocar() {
    if (!share) return;
    const { error } = await supabase
      .from("sitio_shares")
      .delete()
      .eq("id", share.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setShare(null);
    toast.success("Link revocado");
  }

  const url =
    share && typeof window !== "undefined"
      ? `${window.location.origin}/s/${share.token}`
      : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Compartir sitio</DialogTitle>
          <DialogDescription className="text-xs">
            Genera un link público (solo lectura) para compartir esta obra.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {loading && (
            <p className="text-xs text-muted-foreground">Cargando...</p>
          )}
          {share ? (
            <>
              <div className="space-y-1.5">
                <Label>Link público</Label>
                <div className="flex gap-2">
                  <Input value={url} readOnly className="h-10 text-xs" />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 shrink-0"
                    onClick={() => {
                      navigator.clipboard?.writeText(url);
                      toast.success("Copiado");
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Cualquiera con el link puede ver el sitio "{nombre ?? "sin nombre"}".
                </p>
              </div>
              <Button
                variant="outline"
                onClick={revocar}
                className="w-full h-10 text-red-600 border-red-200"
              >
                <X className="h-4 w-4 mr-1" /> Revocar link
              </Button>
            </>
          ) : (
            <Button onClick={generar} className="w-full h-11" disabled={loading}>
              <Link2 className="h-4 w-4 mr-1" /> Generar link
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
