# Portal de Indicadores Técnicos

**Sistema desenvolvido para Demétrius Chiesa**  
**© Demétrius Chiesa - Todos os direitos reservados**

## Entrega
Aplicação HTML5/CSS3/JavaScript ES6 com Supabase Auth, Storage privado, RLS, perfis admin/viewer, Chart.js, DataTables, Bootstrap 5, exportação Excel/PDF/CSV, paginação, cache em memória com expiração, atualização automática e layout responsivo.

## Arquivos
`index.html`, `style.css`, `app.js`, `supabase.js`, `dashboard.js`, `log_manutencao.js`, `tnps.js`, `manifestos.js`, `fca.js`, `supabase.sql` e `COMANDOS_INSTALACAO.md`.

## Configuração
1. Execute `supabase.sql` no SQL Editor.
2. Crie usuários em Authentication.
3. Promova o administrador com o comando comentado no final do SQL.
4. Em `supabase.js`, troque `SEU_URL_SUPABASE` e `SUA_CHAVE_PUBLICA`. Nunca use a chave `service_role` no navegador.
5. Use o bucket privado `dados-operacionais`.

## Storage
```text
mes_atual/LOG_MANUTENCAO.csv
mes_atual/tnps.xlsx
mes_atual/MANIF_RRS.xlsx
historico/2026-06/LOG_MANUTENCAO.csv
historico/2026-06/tnps.xlsx
historico/2026-06/MANIF_RRS.xlsx
fca_manifestos/
```
Ao trocar o mês, mova os arquivos anteriores para `historico/AAAA-MM/` e envie os novos para `mes_atual/`. O seletor é montado automaticamente.

## Regras dos dados
- CSV: Papa Parse, cabeçalho na primeira linha.
- XLSX: primeira aba, processada pelo SheetJS.
- Manifestos: aceita `CAMPO` e `[$analiticos].[CAMPO]`.
- NPS: `((Promotores - Detratores) / respostas) × 100`; 9–10 promotores, 7–8 neutros e 0–6 detratores.

## FCA
Os registros ficam em `public.fca_manifestos`, não no navegador. Admin cria, edita e exclui; viewer apenas lê. O SQL também cria auditoria de alterações. A busca funciona por contrato, manifesto e mês de referência.

## Mobile
Menu e filtros recolhíveis, gráficos em uma coluna, tabelas convertidas em cards e ausência de rolagem horizontal.
