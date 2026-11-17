// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

/**
 * UI language: Portuguese when the phone/browser prefers it, English otherwise.
 * English strings are the keys; add a language by adding a dictionary.
 */
export type Lang = "en" | "pt";

export function detectLang(languages: readonly string[]): Lang {
  for (const l of languages) {
    const code = (l ?? "").toLowerCase();
    if (code.startsWith("pt")) return "pt";
    if (code.startsWith("en")) return "en";
  }
  return "en";
}

export const lang: Lang = detectLang(
  typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language],
);
export const locale = lang === "pt" ? "pt-BR" : "en";

const PT: Record<string, string> = {
  // Navigation & frame
  Gates: "Portões",
  Activity: "Atividade",
  Manage: "Gerenciar",
  Sections: "Seções",
  Account: "Conta",
  Online: "Online",
  Offline: "Offline",
  Close: "Fechar",
  Dismiss: "Dispensar",
  "Loading…": "Carregando…",
  Refresh: "Atualizar",
  "Last {n}": "Últimas {n}",
  // Gate controls
  "Hold to open": "Segure para abrir",
  "Keep holding to open": "Continue segurando para abrir",
  "Press Enter again to open": "Pressione Enter de novo para abrir",
  "Sending…": "Enviando…",
  "Signal sent": "Sinal enviado",
  "Try again": "Tente de novo",
  "{title}. Press and hold to open. Keyboard: press Enter twice.":
    "{title}. Pressione e segure para abrir. Teclado: pressione Enter duas vezes.",
  "Options for {title}": "Opções de {title}",
  "{d} away": "a {d}",
  Nearby: "Perto de você",
  "Your gate": "Seu portão",
  "Other gates": "Outros portões",
  "Show {n}": "Mostrar {n}",
  Hide: "Ocultar",
  "Device offline": "Aparelho offline",
  "Needs your location": "Precisa da sua localização",
  "Only within {r} m": "Só a até {r} m",
  "No gates yet": "Nenhum portão ainda",
  "Waiting for the device": "Aguardando o aparelho",
  "Copy your .sub files to the gates folder on the device, then restart Gate Relay.":
    "Copie seus arquivos .sub para a pasta de portões no aparelho e reinicie o Gate Relay.",
  "Gates appear here as soon as the device connects.": "Os portões aparecem aqui assim que o aparelho conectar.",
  // Banners
  "Last seen {t}. ": "Visto por último {t}. ",
  "Gates can't be opened until it reconnects.": "Não dá para abrir portões até ele reconectar.",
  "Location needed": "Localização necessária",
  "Show the gates near you": "Mostre os portões perto de você",
  "The host asked to check that you're at the gate. Your location is only used for that and never stored.":
    "O anfitrião pediu para confirmar que você está no portão. Sua localização só é usada para isso e nunca é guardada.",
  "Allow location to put the closest gate first. Your location is never stored.":
    "Permita a localização para mostrar primeiro o portão mais próximo. Sua localização nunca é guardada.",
  "Allow location": "Permitir localização",
  "Not now": "Agora não",
  "Location is off": "Localização desligada",
  "Turn on location for this site in your browser settings to open the gates.":
    "Ative a localização para este site nas configurações do navegador para abrir os portões.",
  "Showing all gates. You can allow location later in your browser settings.":
    "Mostrando todos os portões. Você pode permitir a localização depois, nas configurações do navegador.",
  // Errors
  "No answer from the device": "O aparelho não respondeu",
  "Gate not found on the device": "Portão não encontrado no aparelho",
  "Radio transmission failed": "Falha na transmissão de rádio",
  "Device busy, try again": "Aparelho ocupado, tente de novo",
  "Wait {s}s": "Aguarde {s}s",
  "Too many opens, try later": "Muitas aberturas, tente mais tarde",
  "Too far ({d} m away)": "Longe demais (a {d} m)",
  "You are too far": "Você está longe demais",
  "Location needed for this gate": "Este portão precisa da sua localização",
  "Not allowed": "Sem permissão",
  "This invite has expired": "Este convite expirou",
  "This invite is not valid": "Este convite não é válido",
  "Session expired, reload": "Sessão expirada, recarregue",
  "No connection": "Sem conexão",
  "Something went wrong": "Algo deu errado",
  "This account can't open gates": "Esta conta não pode abrir portões",
  "Please sign in again": "Entre de novo",
  "Can't reach the server": "Não foi possível falar com o servidor",
  "Ask the owner to add your email.": "Peça ao dono para adicionar seu e-mail.",
  "Your session expired.": "Sua sessão expirou.",
  "Check your connection and try again.": "Verifique sua conexão e tente de novo.",
  "Sign in": "Entrar",
  "Use another account": "Usar outra conta",
  // Activity
  "No activity yet": "Nenhuma atividade ainda",
  "Every open shows up here: who, which gate and when.": "Cada acionamento aparece aqui: quem, qual portão e quando.",
  "Couldn't load activity": "Não foi possível carregar a atividade",
  " (guest)": " (convidado)",
  " triggered ": " acionou ",
  " tried ": " tentou abrir ",
  " · ≈{d} m away": " · a ≈{d} m",
  "Guest: {label}": "Convidado: {label}",
  Success: "Sucesso",
  Failed: "Falhou",
  "just now": "agora mesmo",
  // Manage
  "Couldn't load": "Não foi possível carregar",
  "Guest invites": "Convites",
  New: "Novo",
  "Having guests over?": "Vai receber visitas?",
  "Create a link that opens the gate for a few hours. No accounts needed, and you can revoke it anytime.":
    "Crie um link que abre o portão por algumas horas. Ninguém precisa de conta, e você pode revogar quando quiser.",
  "{gates} · until {date} · {n} opens": "{gates} · até {date} · {n} aberturas",
  "Location set · {r} m": "Localização definida · {r} m",
  " · proximity required": " · exige proximidade",
  "No location": "Sem localização",
  "No gates from the device": "Nenhum portão no aparelho",
  "Gate settings appear once the device is online.": "As configurações aparecem quando o aparelho estiver online.",
  "Orphaned settings": "Configurações órfãs",
  "These gates are gone from the device": "Estes portões sumiram do aparelho",
  "Probably a renamed .sub file. Move the settings to the new name or delete them.":
    "Provavelmente um arquivo .sub renomeado. Mova as configurações para o novo nome ou apague.",
  "Has a location": "Tem localização",
  Backup: "Backup",
  "Export gate settings": "Exportar configurações",
  "Download a JSON backup": "Baixar um backup em JSON",
  "Import gate settings": "Importar configurações",
  "Restore from a JSON backup": "Restaurar de um backup em JSON",
  "Not announced by the device anymore.": "O aparelho não anuncia mais este portão.",
  "Move settings to “{name}”": "Mover configurações para “{name}”",
  "Settings moved": "Configurações movidas",
  "Delete settings": "Apagar configurações",
  Deleted: "Apagado",
  "Imported {n} gate(s)": "{n} portão(ões) importado(s)",
  "That file is not a gate settings backup": "Esse arquivo não é um backup de configurações",
  // Account
  "Signed in as": "Conectado como",
  Role: "Papel",
  Admin: "Administrador",
  Member: "Membro",
  "Add to Home Screen": "Adicionar à tela inicial",
  "In Safari, tap Share, then “Add to Home Screen”.":
    "No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.",
  "In Chrome, open the ⋮ menu, then “Add to Home screen” or “Install app”.":
    "No Chrome, abra o menu ⋮ e toque em “Adicionar à tela inicial” ou “Instalar app”.",
  "Sign out": "Sair",
  "Open source on GitHub": "Código aberto no GitHub",
  "bruce-gate-relay is free software (AGPL-3.0).": "O bruce-gate-relay é software livre (AGPL-3.0).",
  // Gate menu & settings
  "Location set · {r} m radius": "Localização definida · raio de {r} m",
  "No location yet": "Ainda sem localização",
  "Set location here": "Definir localização aqui",
  "Edit gate settings": "Editar portão",
  "Share with guests": "Compartilhar com convidados",
  "Getting your location…": "Obtendo sua localização…",
  "Accuracy is ±{a} m. Open settings to review before saving.":
    "Precisão de ±{a} m. Revise nas configurações antes de salvar.",
  "Location saved (±{a} m)": "Localização salva (±{a} m)",
  "Couldn't get your location. Try outdoors or allow location.":
    "Não foi possível obter sua localização. Tente ao ar livre ou permita a localização.",
  "Couldn't get your location. Allow location and try outdoors.":
    "Não foi possível obter sua localização. Permita a localização e tente ao ar livre.",
  "Gate settings": "Configurações do portão",
  "Display name": "Nome de exibição",
  "Device file: {file}": "Arquivo no aparelho: {file}",
  Icon: "Ícone",
  Location: "Localização",
  "Use my current location": "Usar minha localização atual",
  "Locating…": "Localizando…",
  "Good fix: ±{a} m": "Boa precisão: ±{a} m",
  "Weak fix: ±{a} m. Wait a moment or try outdoors, then tap again.":
    "Precisão fraca: ±{a} m. Aguarde um pouco ou vá para fora e toque de novo.",
  "Or paste coordinates": "Ou cole as coordenadas",
  "Copy them from Google Maps: long-press the gate → tap the coordinates.":
    "Copie do Google Maps: toque e segure no portão → toque nas coordenadas.",
  "Use the format: -23.55, -46.63": "Use o formato: -23.55, -46.63",
  "Open in Maps": "Abrir no Maps",
  "Nearby radius ": "Raio de proximidade ",
  "Radius in meters": "Raio em metros",
  "Inside this distance the gate shows up as “Nearby”.":
    "Dentro dessa distância o portão aparece como “Perto de você”.",
  "Require proximity": "Exigir proximidade",
  "Only open when the phone is within the radius": "Só abre quando o celular estiver dentro do raio",
  Save: "Salvar",
  Saved: "Salvo",
  "Remove location": "Remover localização",
  "Location removed": "Localização removida",
  "Set a location before requiring proximity": "Defina a localização antes de exigir proximidade",
  // Invites
  "Guests open the gate from a link. No account needed.":
    "Os convidados abrem o portão por um link. Ninguém precisa de conta.",
  Name: "Nome",
  "Birthday party": "Festa de aniversário",
  Starts: "Começa",
  Ends: "Termina",
  "4 hours": "4 horas",
  Tonight: "Esta noite",
  "24 hours": "24 horas",
  "3 days": "3 dias",
  "Guests must be at the gate": "Convidados precisam estar no portão",
  "Recommended: a forwarded link won't work from far away": "Recomendado: um link encaminhado não funciona de longe",
  "Max opens (optional)": "Máximo de aberturas (opcional)",
  Unlimited: "Ilimitado",
  "No location for {names}": "Sem localização para {names}",
  "Proximity can't be checked there. Set the location first (stand at the gate → ⋯ → Set location here).":
    "Não dá para verificar a proximidade nesse portão. Defina a localização antes (fique no portão → ⋯ → Definir localização aqui).",
  "Create invite": "Criar convite",
  "Pick at least one gate": "Escolha pelo menos um portão",
  "Invite ready": "Convite pronto",
  "Valid until {date}. Save it now: for security, this link is only shown once.":
    "Válido até {date}. Guarde agora: por segurança, este link só aparece uma vez.",
  "QR code for {label}": "QR code de {label}",
  Copy: "Copiar",
  "Link copied": "Link copiado",
  "Couldn't copy. Long-press the link to copy it.": "Não foi possível copiar. Toque e segure no link para copiar.",
  "Share link": "Compartilhar link",
  "{label}: open the gate from your phone. Valid until {date}.":
    "{label}: abra o portão pelo celular. Válido até {date}.",
  Status: "Status",
  Opens: "Aberturas",
  "Must be at the gate": "Precisa estar no portão",
  Yes: "Sim",
  No: "Não",
  "Created by": "Criado por",
  "Revoke invite": "Revogar convite",
  "Revoke “{label}”? The link stops working immediately.": "Revogar “{label}”? O link para de funcionar na hora.",
  "Invite revoked": "Convite revogado",
  Active: "Ativo",
  Scheduled: "Agendado",
  Expired: "Expirado",
  "Used up": "Esgotado",
  Revoked: "Revogado",
  // Guest
  "Invite link needed": "Precisa do link do convite",
  "Open the link the host sent you.": "Abra o link que o anfitrião enviou.",
  "This invite has ended": "Este convite terminou",
  "This invite isn't valid": "Este convite não é válido",
  "Ask the host for a new link.": "Peça um novo link ao anfitrião.",
  "Check your mobile data and reload.": "Verifique seus dados móveis e recarregue.",
  "You're invited. This link works until {date}.": "Você foi convidado. Este link funciona até {date}.",
  " {n} opens left.": " Restam {n} aberturas.",
  "Your location is only used to check that you're at the gate and is never stored. ":
    "Sua localização só é usada para confirmar que você está no portão e nunca é guardada. ",
  "Tip: add this page to your Home Screen for quick access.":
    "Dica: adicione esta página à tela inicial para abrir mais rápido.",
  // Server validation messages (shown in admin toasts)
  "Latitude must be -90..90 and longitude -180..180":
    "A latitude deve ficar entre -90 e 90 e a longitude entre -180 e 180",
  "Radius must be 100..2000 m": "O raio deve ficar entre 100 e 2000 m",
  "Set a location before requiring proximity.": "Defina a localização antes de exigir proximidade.",
  "Label is required (max 60)": "O nome é obrigatório (máx. 60)",
  "Unknown gate": "Portão desconhecido",
  "Invalid dates": "Datas inválidas",
  "The end must be in the future and after the start": "O fim precisa ser no futuro e depois do início",
  "Invites can last 30 days at most": "Convites duram no máximo 30 dias",
  "maxOpens must be 1..1000": "O máximo de aberturas deve ficar entre 1 e 1000",
  "Admins only": "Só administradores",
};

const DICTS: Record<Lang, Record<string, string>> = { en: {}, pt: PT };

/** Translates an English UI string and fills `{name}` placeholders. Unknown strings pass through. */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  const template = DICTS[lang][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}
