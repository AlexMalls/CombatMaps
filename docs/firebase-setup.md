# Salvamento e sincronização do CombatMaps

O projeto compartilhado usa Cloud Firestore, sem Firebase Storage e sem login nesta etapa. Os dados ficam em `projects/main` e `projects/main/parts/{parte}`. As regras de `firestore.rules` precisam estar publicadas pelo proprietário; commits no GitHub não publicam regras automaticamente.

O banco é a única fonte persistente do projeto. Não há leitura, gravação ou recuperação automática por IndexedDB/localStorage. O SDK usa cache somente em memória. Ao fechar a página sem conexão, alterações ainda pendentes podem ser perdidas. Exportar JSON continua disponível como ação manual.

## Uso e economia

- Uma assinatura nativa acompanha as partes do projeto, sem consultas periódicas ao banco. A primeira conexão lê as partes existentes; atualizações entregam os documentos alterados para cada cliente conectado.
- Alterações próximas são agrupadas, com intervalo mínimo de 750 ms entre envios. Gestos e animações precisam terminar antes de salvar.
- Apenas as partes alteradas e o documento de revisão são gravados. Sem alteração, não há gravação. Uma mudança pequena normalmente grava dois documentos; projetos maiores podem ter mais partes.
- Câmera, zoom, seleção e disposição dos controles pertencem ao dispositivo e não são persistidos. Grid, cenas, tokens e seus dados são compartilhados.
- Transações combinam alterações independentes feitas simultaneamente. Exclusões prevalecem sobre edições antigas; conflitos no mesmo campo usam a última alteração submetida. Tentativas de transação podem aumentar leituras.
- Sem conexão, as alterações ficam apenas na memória enquanto a página permanece aberta. Falhas usam espera progressiva; erros de permissão ou cota suspendem tentativas automáticas até nova conexão ou ação manual.

Monitore Firestore → Uso. As cotas gratuitas são 50 mil leituras, 20 mil gravações e 20 mil exclusões por dia, 1 GiB armazenado e 10 GiB de saída por mês. Consulte os valores atuais em https://firebase.google.com/docs/firestore/quotas e as regras de cobrança de assinaturas em https://firebase.google.com/docs/firestore/pricing.

Para configurar regras e índices por CLI autenticada: `firebase deploy --project combatmaps-5f734 --only firestore:rules,firestore:indexes`. O JSON das partes não precisa ser indexado; veja `firestore.indexes.json`.

## Mídias

Envie imagens para `Midia/Storage/Tokens` ou `Midia/Storage/Cenas`. A biblioteca consulta o GitHub público ao abrir Nuvem. HUD só fornece recursos da interface. Arquivos não se transformam em cadastros automaticamente: crie um tipo de token ou cena e escolha a imagem. Atualizar biblioteca refaz a listagem. Os projetos usam caminhos; mantenha os arquivos referenciados no GitHub.

A edição de uma imagem da nuvem exporta o PNG editado. Envie esse arquivo para Storage no Git e selecione-o novamente; o banco não armazena imagens editadas nem URLs blob temporárias. A função local original permanece no código, desabilitada na interface.

## Verificação

- `node --test tests/*.test.cjs`
- `node scripts/verify-realtime.cjs`: duas páginas reais, edição simultânea, assinatura, ausência de gravações ociosas e de persistência local. Somente o transporte Firebase/GitHub é simulado; não mede cobrança real.
- `node scripts/verify-world-grid.cjs`: grid, tokens e rotação em quatro tamanhos de tela. Para fornecer Chromium instalado, defina `COMBATMAPS_BROWSER_PATH`; para fornecer a imagem de teste, defina `COMBATMAPS_TEST_MAP`.
