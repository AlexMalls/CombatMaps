# Salvamento e sincronização do CombatMaps

O projeto compartilhado usa Cloud Firestore, sem Firebase Storage e sem login nesta etapa. Os dados ficam em `projects/main` e `projects/main/parts/{parte}`. As regras de `firestore.rules` precisam estar publicadas pelo proprietário; commits no GitHub não publicam regras automaticamente.

O banco é a única fonte persistente do projeto. Não há leitura, gravação ou recuperação automática por IndexedDB/localStorage. O SDK usa cache somente em memória. Ao fechar a página sem conexão, alterações ainda pendentes podem ser perdidas. Exportar JSON continua disponível como ação manual.

## Uso e economia

- Uma assinatura nativa acompanha as partes do projeto, sem consultas periódicas ao banco. A primeira conexão lê as partes existentes; atualizações entregam os documentos alterados para cada cliente conectado.
- Alterações próximas são agrupadas, com intervalo mínimo de 750 ms entre envios. Gestos e animações precisam terminar antes de salvar.
- Apenas as partes alteradas e o documento de revisão são gravados. Sem alteração, não há gravação. Uma mudança pequena normalmente grava dois documentos; projetos maiores podem ter mais partes.
- Câmera, zoom, seleção e disposição dos controles pertencem ao dispositivo e não são persistidos. Tamanho/distância do grid, cenas, tokens e seus dados são compartilhados. Visibilidade e opacidade do grid são individuais.
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

## Demonstrações compartilhadas

Régua, destaques (incluindo formas e prévias) e destinos/guias de movimento são compartilhados separadamente do projeto, no documento `projects/main/parts/~demonstrations`. As regras atuais já permitem esse documento. A consulta do projeto exclui esse documento para não cobrar leituras duplicadas nem gerar salvamentos de retorno.

Cada navegador tem sua própria entrada temporária: receber uma demonstração não seleciona tokens, não ativa ferramentas e não altera a câmera. Coordenadas são do grid da cena. A régua é removida ao soltar; destaques e destinos seguem a limpeza normal da ferramenta de origem. Trocar de cena remove a demonstração anterior.

Envios são limitados a um por segundo, usando uma leitura de transação e uma gravação do documento compartilhado, além da entrega para cada observador. Demonstrações que continuam visíveis renovam sua validade uma vez por minuto. Depois de 90 segundos sem renovação, deixam de aparecer; entradas expiradas são removidas na próxima gravação. Sem demonstrações, não há heartbeat nem gravações. O horário é ancorado em uma requisição HEAD ao próprio site para evitar diferenças no relógio dos dispositivos; isso não consulta o Firestore.

`node scripts/verify-demonstrations.cjs` verifica régua durante arraste, cone, autores simultâneos, zoom distinto, guias de destino, limpeza, relógio do celular adiantado em dois minutos e ausência de gravações do projeto. O transporte Firebase é simulado; a interface e os módulos de sincronização são reais.


## Usuário e preferências do navegador

A primeira visita exige escolher Mestre ou Jogador em um diálogo modal com fundo desfocado, sem interação com o mapa ou atalhos. Configurações → Alterar usuário reabre essa escolha. O perfil não é autenticação; as permissões desta etapa separam controles de Mestre e Jogador. Apenas Mestre altera tamanho e distância entre pontos do grid. Os controles correspondentes ficam desabilitados para Jogador no mapa e no editor de cenas. Importações de Jogador preservam a geometria existente e usam a geometria atual para cenas novas.

O navegador persiste somente perfil, visibilidade e opacidade em `combatmaps.browser-preferences.v1`. O grid começa visível em 10%. Essas preferências não entram nos dados compartilhados nem são substituídas por cenas ou projetos recebidos. O projeto continua sem persistência/recuperação automática local.

Guias laranja exibem a contagem de células, usando a mesma métrica diagonal da régua e o mesmo estilo de posicionamento/tamanho do número, em laranja. A contagem é de quadrados; não é multiplicada pela distância entre pontos. O número acompanha também as demonstrações recebidas de outros navegadores.

`node scripts/verify-user-preferences.cjs` usa dois processos de navegador independentes e verifica escolha obrigatória, bloqueio de Esc/F2, persistência, troca de perfil, aparência individual sem gravação do projeto, geometria compartilhada e número laranja. Somente o transporte Firebase/GitHub é simulado.


## Interface do Jogador

- Grid: somente Mostrar grid e Opacidade. Com grid oculto, a opacidade recolhe em 180 ms, sem espaço residual nem foco; respeita movimento reduzido. Grid absoluto, tamanho e distância não aparecem.
- Engrenagem: Alterar usuário, Tela cheia (alternando entrar/sair), orientação da barra de comando e sensibilidade. Debug, salvamento/importação/exportação e histórico ficam exclusivos do Mestre.
- Modo toque é automático em dispositivos de ponteiro primário grosso e sem hover. A opção aparece somente para Mestre em desktop; notebooks híbridos com mouse continuam podendo alternar o modo.
- O menu do Mestre, docks e explorador ficam fechados, ocultos e indisponíveis para Jogador. Receber cenas do servidor continua funcionando.
- Barra de comando: Jogador pode consultar/selecionar tokens, controlar vínculos e opacidade. Dano, cura e aplicação de status ficam ocultos e suas ações bloqueadas. Trocar de perfil atualiza a barra imediatamente. Jogador não desfaz/refaz comandos de dano/cura/status feitos anteriormente como Mestre.

`node scripts/verify-player-ui.cjs` verifica menus compactos em celular, recolhimento, tela cheia real entrando/saindo, seleção de consulta, bloqueio de ações, troca de perfil e recarregamento. O Firebase é simulado; não há gravações de projeto causadas por esses ajustes locais.
