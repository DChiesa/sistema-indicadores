# Comandos de instalação

## Rodar localmente
```bash
cd sistema-indicadores
npx serve . -l 8080
```
Acesse `http://localhost:8080`; não use `file://`.

## Publicar no GitHub Pages
```bash
git init
git add .
git commit -m "Portal de indicadores"
git branch -M main
git remote add origin URL_DO_REPOSITORIO
git push -u origin main
```
Em **Settings > Pages**, selecione `main` e `/root`.

## Supabase
- SQL Editor: execute `supabase.sql`.
- Authentication > Users: crie os usuários.
- Storage: o SQL cria o bucket `dados-operacionais`.
- Edite somente URL e chave pública em `supabase.js`.
