# Ativar salvamento do CombatMaps

1. Console Firebase → CombatMaps → Firestore → Regras.
2. Substitua as regras pelo conteúdo de `firestore.rules` deste repositório.
3. Clique em Publicar. As regras isolam os projetos por UID da conta Google.
4. No CombatMaps, engrenagem → Entrar com Google.
5. Clique em Salvar agora e confira a mensagem Salvo no Firebase.

Storage e plano Blaze não são necessários. Dados ficam em `users/{uid}/project/state` e `users/{uid}/parts`. As partes contêm JSON dos catálogos, cenas e instâncias; não contêm imagens. A caixa Salvamento automático envia apenas alterações a cada 10 segundos. Importar projeto força uma gravação; sem conexão/conta permanece pendente e a cópia local é preservada.

Para gerenciar índices por CLI com uma conta autenticada: `firebase deploy --project combatmaps-5f734 --only firestore:rules,firestore:indexes`. O arquivo `firestore.indexes.json` exclui o JSON dos índices: não realizamos consultas sobre o conteúdo das partes.

As regras em produção precisam ser publicadas pelo proprietário; o repositório não publica regras Firebase automaticamente. Nenhum SDK, API key web ou checkbox substitui essas regras.

## Mídias

Envie imagens para `Midia/Storage/Tokens` ou `Midia/Storage/Cenas`. A biblioteca consulta o GitHub público ao abrir Nuvem. HUD só fornece recursos da interface. Arquivos não se transformam em cadastros automaticamente: crie um tipo de token ou cena e escolha a imagem. Atualizar biblioteca refaz a listagem. Os backups JSON usam caminhos; mantenha os arquivos referenciados no GitHub.

A edição de uma imagem da nuvem exporta o PNG editado. Envie esse arquivo para Storage no Git e selecione-o novamente; o banco não armazena imagens editadas nem URLs blob temporárias. A função local original permanece no código, desabilitada na interface.

## Verificação

- `node --test tests/*.test.cjs`
- `node scripts/verify-cloud-media.cjs` com Playwright disponível. A verificação usa dados descartáveis e simula somente GitHub e Firebase; testa a interface real, IndexedDB, restauração e importação/exportação. Para fornecer um Chromium instalado, defina `COMBATMAPS_BROWSER_PATH`.
- Login Google e gravação real exigem conta autorizada e publicação das regras; não foram substituídos por uma mensagem de sucesso simulada em produção.
