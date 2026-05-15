import { useEffect, useState } from "react";
import { Send, AtSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
  type SitioComentario,
} from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

interface Props {
  sitioId: string;
  vendedorId: string | null;
}

interface ComentarioConAutor extends SitioComentario {
  autor?: { nombre: string | null; email: string | null } | null;
}

export function SitioComentarios({ sitioId, vendedorId }: Props) {
  const { user, profile } = useAuth();
  const [comentarios, setComentarios] = useState<ComentarioConAutor[]>([]);
  const [mensaje, setMensaje] = useState("");
  const [mencionA, setMencionA] = useState<string>("none");
  const [contactos, setContactos] = useState<Profile[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void load();
    void loadContactos();
    const ch = supabase
      .channel(`comentarios-${sitioId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "sitio_comentarios",
          filter: `sitio_id=eq.${sitioId}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitioId]);

  async function load() {
    const { data } = await supabase
      .from("sitio_comentarios")
      .select("*, autor:autor_id(nombre,email)")
      .eq("sitio_id", sitioId)
      .order("created_at", { ascending: true });
    setComentarios((data as ComentarioConAutor[]) ?? []);
  }

  async function loadContactos() {
    // Vendedor del sitio + gerentes/heads visibles (RLS de profiles)
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .neq("id", user?.id ?? "")
      .limit(30);
    setContactos((data as Profile[]) ?? []);
  }

  async function send() {
    if (!user || !mensaje.trim()) return;
    setSending(true);
    const { error } = await supabase.from("sitio_comentarios").insert({
      sitio_id: sitioId,
      autor_id: user.id,
      mensaje: mensaje.trim(),
      mencion_a: mencionA === "none" ? null : mencionA,
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMensaje("");
    setMencionA("none");
    void load();
  }

  return (
    <div>
      <h3 className="font-semibold mb-2">Comentarios</h3>
      <p className="text-xs text-muted-foreground mb-3">
        Coordina con tu gerente sin salir de la app. Menciona a alguien para que
        reciba alerta.
      </p>

      {comentarios.length === 0 ? (
        <p className="text-xs text-muted-foreground mb-3">
          Aún no hay comentarios.
        </p>
      ) : (
        <ul className="space-y-2 mb-3">
          {comentarios.map((c) => {
            const isMine = c.autor_id === user?.id;
            return (
              <li
                key={c.id}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  isMine
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <div className="text-[10px] opacity-70 mb-0.5">
                  {c.autor?.nombre ?? c.autor?.email ?? "Anónimo"} ·{" "}
                  {new Date(c.created_at).toLocaleString("es-MX", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
                <p className="whitespace-pre-wrap break-words">{c.mensaje}</p>
              </li>
            );
          })}
        </ul>
      )}

      {user && (
        <div className="bg-card border rounded-lg p-2 space-y-2">
          <Textarea
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            placeholder="Escribe un comentario..."
            rows={2}
            className="resize-none"
          />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 flex-1">
              <AtSign className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Select value={mencionA} onValueChange={setMencionA}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Mencionar (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin mención</SelectItem>
                  {vendedorId && vendedorId !== user.id && (
                    <SelectItem value={vendedorId}>
                      Vendedor del sitio
                    </SelectItem>
                  )}
                  {contactos
                    .filter((c) => c.id !== vendedorId)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nombre ?? c.email ?? c.id.slice(0, 8)}
                        {c.role !== "vendedor" && ` (${c.role})`}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              onClick={send}
              disabled={!mensaje.trim() || sending}
              className="h-8"
            >
              <Send className="h-3.5 w-3.5 mr-1" /> Enviar
            </Button>
          </div>
          {profile?.role === "vendedor" && (
            <p className="text-[10px] text-muted-foreground">
              Tip: menciona a tu gerente si necesitas ayuda con esta obra.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
