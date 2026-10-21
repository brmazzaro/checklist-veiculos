# Checklist de Veículos (PWA offline)

App baseado em "check list diaria veiculos.pdf" (rev. 08/11/2024).

## Como instalar no Android
1. Publique a pasta `app/` em um endereço **HTTPS** (GitHub Pages, servidor/intranet da empresa, Netlify etc.).
   Para testar no PC: `npx serve app` e abra `http://localhost:3000` (localhost também permite service worker).
2. No celular, abra o endereço no **Chrome** (precisa de internet só nesta primeira vez).
3. Menu ⋮ → **Instalar app** / **Adicionar à tela inicial**.
4. Depois disso o app abre e funciona sem internet.

## Recursos
- 35 itens C / NC / N/A, tipo de inspeção, dados do veículo, próxima revisão (km).
- Croqui de avarias (A, R, X, PF): toque no desenho para marcar.
- Fotos tiradas na hora (câmera) ou da galeria; botão 📷 em cada item NC.
- Assinaturas na tela (auditor, condutor, supervisor).
- Rascunho salvo automaticamente no aparelho (IndexedDB); histórico com reabrir/excluir.
- PDF gerado no aparelho (A4): ficha, croqui, observações, assinaturas e fotos. Baixa em Downloads ou compartilha (WhatsApp, e-mail).

## Atualizações
Ao alterar arquivos, aumente o número de `CACHE` em `sw.js` (ex.: `checklist-v2`).
