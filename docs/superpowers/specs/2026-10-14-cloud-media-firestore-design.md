# CombatMaps: biblioteca de mídias e persistência

## Objetivo aprovado

As imagens continuam no GitHub e são servidas pelo site. Os cadastros de tipos de token, cenas e o estado de jogo passam a ser dados do Firestore. A existência de uma imagem não cria um token nem uma cena. Não usar Firebase Storage nem exigir Blaze.

## Organização de arquivos

- `Midia/HUD/Moldura.jpeg` e `Midia/HUD/Universe.jpeg`: recursos da interface, excluídos do seletor.
- `Midia/Storage/Tokens/Soldados 01 PNG.png`: mover a imagem existente preservando seus bytes.
- `Midia/Storage/Cenas/.gitkeep`: manter a pasta inicialmente vazia.
- Atualizar as referências da interface e migrar caminhos antigos nos dados existentes.
- HUD não aparece no seletor; isto não constitui proteção de acesso HTTP a arquivos de um repositório público.

## Escolha de imagem

Um diálogo comum atende todos os pontos de escolha de imagem: criar/editar tipo de token, criar/editar fundo de cena e demais importações de imagem existentes. Primeiro apresenta Local e Nuvem. Local usa botão nativamente desabilitado e aparência cinza, com explicação acessível; manter os handlers de arquivo existentes no código sem expor atalhos de interface que contornem essa decisão. Nuvem abre miniaturas de todas as imagens sob Storage, com identificação de Tokens/Cenas, estado vazio, carregamento, erro e tentativa novamente. Não exibir arquivos de HUD ou arquivos auxiliares.

A seleção mantém uma referência de caminho, sem baixar ou copiar a imagem para o banco. Cancelar não modifica o cadastro. A imagem passa a integrar um tipo de token ou cena somente ao confirmar o respectivo editor. Escolher a mesma imagem para mais de um cadastro é permitido. Falha de imagem não apaga os registros.

O catálogo de arquivos deve refletir o GitHub atual ao abrir/recarregar a biblioteca, com cache e tratamento do limite da API pública. Não colocar credenciais GitHub no cliente. Conferir a visibilidade do repositório antes da implementação; se privado, servir catálogo e arquivos pelo deploy ou por backend autenticado, sem expor token pessoal.

## Persistência

Usar a configuração já fornecida de `combatmaps-5f734`, Firebase Authentication com Google e Firestore Standard. Cada usuário acessa somente seu projeto em `users/{uid}`. O modo mestre da interface não serve como autorização do banco. Publicar regras que validem `request.auth.uid == uid`; manter negação de acesso até as regras serem configuradas.

O formato versionado contém: catálogo de tipos e seus IDs, nomes, caminhos de imagem, tamanho e vida inicial; catálogo de status; cenas/mapas e seus IDs, canvas, fundo, recorte, grid; instâncias de token por cena com IDs, tipo, posição, tamanho, vida máxima/atual e status; cena ativa, câmera e configurações persistentes. Não serializar DOM, WeakMap, ponteiros, timers, diálogos abertos, animações ou gestos em andamento.

Separar metadados, tipos, status, cenas e instâncias em documentos/coleções, evitando um único documento de projeto sujeito ao limite de 1 MiB. Agrupar gravações e atualizar somente documentos alterados. Capturar posição final ao soltar, sem persistir cada frame. Remoções também devem ser sincronizadas. Identidades dos tokens precisam continuar únicas após restauração, colagem e novas instâncias.

Guardar cópia local versionada, isolada por conta, após alterações concluídas. A cada 10 segundos, se o salvamento automático estiver ativo e houver mudanças, enviar somente alterações pendentes. Uma requisição por vez; mudanças durante envio permanecem pendentes e são confirmadas somente na versão realmente enviada. Nunca indicar salvo antes de confirmação remota. Falhas preservam o estado local e mostram pendência. A checkbox controla a sincronização periódica, não a cópia local.

Carregar dados da conta antes de permitir edição que possa sobrescrever o remoto. Um projeto remoto vazio é válido e não deve recriar exemplos. Para contas novas, começar sem cadastros automáticos de Soldado/cenas de teste. Antes da migração, preservar qualquer estado local recuperável; o código atual contém demonstrações em memória e não oferece persistência durável. Não prometer recuperar estado perdido em recarregamentos anteriores. Manter testes de funcionalidades existentes com fixtures explícitas, sem depender de demonstrações em produção.

Ao retornar, recuperar o projeto salvo e a cena ativa. Ao sair/offline, preservar a cópia local; envio no fechamento é apenas tentativa adicional. Evitar que duas abas/aparelhos sobrescrevam mudanças silenciosamente: usar revisão remota e aviso de conflito, oferecendo recarregar ou salvar explicitamente a cópia local. Nunca sincronizar automaticamente um cache de outra conta.

## Importação/exportação de dados

Nas configurações, oferecer exportação JSON versionada com todos os dados e caminhos das mídias; as imagens permanecem no GitHub. Validar formato, campos, IDs, referências e tamanhos antes da importação. Confirmar substituição antes de aplicar. A importação força sincronização mesmo com a checkbox desmarcada; offline mantém pendência visível. Restaurar também a cena ativa. Não importar imagens locais nesta versão.

## Componentes e validação

Separar biblioteca de mídia, codec de projeto e adaptador Firebase em módulos pequenos, integrando-os aos editores e operações atuais. Preservar edição de imagem existente: resultados derivados que geram novos bytes precisam ser tratados explicitamente sem gravá-los como simples URL; sem Storage, persistir transformações reproduzíveis sobre a imagem de origem ou manter a edição indisponível com aviso até existir solução, nunca fingir que um blob temporário será recuperável.

Testar filtros/exclusão de HUD, opção Local desabilitada, cancelamento, ausência de criação automática, codec e migração, restauração de cenas e instâncias, gravação apenas com mudanças, alterações durante envio, remoções, erros/offline, isolamento por conta, conflito de revisão, importação forçada e regras de acesso. Executar suíte existente e reportar separadamente testes novos e total. Realizar ao menos uma verificação visual com captura no navegador, sem enviar imagem salvo solicitação. Validar login e gravação real somente com sessão autorizada; se regras ou login bloquearem, informar precisamente a etapa pendente.

## Dependências externas

Login Google e domínio da Vercel já foram configurados pelo usuário; Firestore foi criado em produção. Ainda é necessário conferir/publicar regras de acesso. Preparar arquivo de regras e instruções exatas caso não haja acesso autorizado ao console. Não usar regras abertas como alternativa. Implementação e publicação devem partir da versão atual do repositório para preservar uploads simultâneos do usuário.
