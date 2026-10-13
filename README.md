# Corredor sem fim

Protótipo de jogo roguelike para navegador, feito com Phaser e TypeScript.

## Abrir durante o desenvolvimento

1. Instale Node.js LTS.
2. Na pasta do projeto, rode `npm install`.
3. Rode `npm run dev` e abra o endereço local exibido no terminal.

Para gerar os arquivos de publicação, rode `npm run build`; o resultado fica em `dist/` e pode ser hospedado como site estático.

As regras e decisões do protótipo estão em [ARQUITETURA.md](./ARQUITETURA.md). Os valores de balanceamento ficam em `src/game/rules/config.ts`.

## Organização do código

- `src/game/application`: coordenação da tentativa, salas e progressão.
- `src/game/content`: definições de classes, inimigos, itens, magias e eventos.
- `src/game/combat` e `src/game/rules`: resolução de combate e regras independentes da interface.
- `src/infrastructure/persistence`: leitura e gravação da tentativa no navegador.
- `src/presentation/phaser/screens`: telas independentes e componentes visuais.
- `src/scenes`: integração da interface Phaser com o controlador do jogo.

## Estado atual

- Menu com seleção de Guerreiro, Ladino ou Mago e opção de retomar o salvamento local.
- Corredor vertical, salas com combate, descanso, baú ou sala vazia, e botão de avanço após o evento.
- Fundo pixel art de esgoto, sprites específicos de classe e espécie, chefe, ícone da poção e da Flecha de Fogo, janela de atributos e status, botões animados e efeitos visuais de combate.
- Combate contra um inimigo com histórico das últimas ações, ataques básicos por classe, Flecha de Fogo e Queimadura para o Mago, Defender, poção de cura, XP, níveis e alocação de atributos.
- Defender prepara resistência para o próximo turno do inimigo e expira depois dele, mesmo se nenhum ataque acertar; itens encontrados com inventário cheio permitem substituir um espaço ou descartar o item.
- Os eventos são sorteados em cada andar com pesos configurados, e a sala final permanece reservada ao chefe.
- Inimigos são gerados ao entrar na sala com base no nível atual do jogador.
- Persistência local validada, com retomada da ação inimiga caso a página seja recarregada após a ação do jogador.

Arte final, outras magias, segundo consumível, múltiplos inimigos e a progressão completa de conteúdo ainda estão em desenvolvimento. Os ataques básicos e a Flecha de Fogo usam crítico, esquiva e redução de dano.
