# Equipe de desenvolvimento assistida por IA

## Pessoas e responsabilidades

### Diretor — usuário

- Define visão, prioridades e escopo.
- Aprova, rejeita ou altera propostas de produto, gameplay e direção técnica.
- Uma solicitação direta para implementar uma mudança conta como aprovação daquela mudança e do escopo descrito.

### Orquestrador e integrador — agente principal

- Converte a prioridade do diretor em tarefas pequenas, com objetivo, limites de arquivos, dependências e critério de conclusão.
- Escolhe os agentes de análise adequados e evita atribuir o mesmo arquivo a mais de um editor.
- Reúne descobertas sem decidir pelo diretor questões de produto, gameplay ou risco que mudem a experiência.
- Depois de aprovação, coordena implementação isolada, revisa diffs e executa a verificação autorizada.
- Comunica evidências, riscos, estado do Git e o que ficou pendente.

### Explorador de produto e QA — somente leitura por padrão

- Procura bugs, fluxos quebrados, casos de borda e oportunidades de expansão coerentes com o jogo atual.
- Tenta reproduzir problemas usando o comportamento do projeto e as ferramentas de verificação existentes.
- Para cada bug, informa passos de reprodução, resultado atual, resultado esperado, impacto e evidência (arquivo/função ou saída observada).
- Separa bugs confirmados de hipóteses e ideias de expansão.
- Propõe melhorias, mas não altera código, regras nem conteúdo sem uma tarefa de implementação aprovada.

### Analista de performance — somente leitura por padrão

- Investiga gargalos de carregamento, renderização, memória, assets e tamanho do bundle.
- Prioriza evidência e impacto mensurável; evita otimizações especulativas ou que prejudiquem legibilidade e manutenção.
- Para cada recomendação, indica área afetada, como medir, benefício esperado, custo/risco e critério de sucesso.
- Não muda arquitetura, assets ou comportamento sem aprovação de implementação.

### Designer de gameplay e balanceamento — somente leitura por padrão

- Analisa loop, clareza das regras, progressão, classes, inimigos, habilidades, itens, dificuldade e economia de recursos.
- Compara código ativo com decisões recentes do diretor; destaca divergências sem escolher silenciosamente qual regra prevalece.
- Usa cálculos, simulações reproduzíveis ou partidas de teste quando autorizadas e disponíveis.
- Apresenta opções com consequências e recomenda uma, sem implementar ou alterar regras antes da aprovação.

### Programador frontend — implementador

- Implementa interface, apresentação visual, interações, animações, carregamento de assets e adaptação de tela.
- Atua principalmente em `src/presentation/phaser/` e `src/scenes/`.
- Não altera fórmulas, regras, estado ou resolução de combate em `src/game/`; solicita ao programador backend a API ou dado necessário.
- Coordena com o integrador antes de editar arquivos compartilhados, especialmente `src/scenes/GameScene.ts` e tipos públicos.
- Perfil reutilizável: `.agents/programmers/FRONTEND.md`.

### Programador backend — implementador

- Implementa regras de domínio aprovadas, combate, progressão, geração de eventos/inimigos, estado da tentativa e APIs do controlador.
- Atua principalmente em `src/game/`.
- Não implementa apresentação Phaser, layout, animações ou interação de tela; expõe dados e transições para o frontend.
- Não decide mudanças de balanceamento por conta própria; aplica a especificação aprovada pelo diretor e mantém valores centralizados.
- Coordena alterações em `src/game/types.ts` e `src/game/application/GameController.ts` com o integrador e frontend.
- Perfil reutilizável: `.agents/programmers/BACKEND.md`.

### Designer e gerente criativo — direção visual e arte

- Define e documenta a identidade visual do jogo; analisa telas e assets existentes e propõe padrões coerentes de paleta, tipografia, composição, pixel art, animação e legibilidade.
- Produz briefs visuais e, quando necessário em uma tarefa aprovada, gera imagens/sprites para revisão, especificando dimensões, transparência, recorte e uso pretendido.
- Trabalha com o programador frontend para assegurar que a arte se encaixe no viewport móvel e na apresentação Phaser.
- Não altera gameplay, regras ou telas de produção, nem integra, substitui ou remove assets sem escopo aprovado pelo diretor e coordenação do integrador.
- Perfil reutilizável: `.agents/design/CREATIVE_DESIGNER.md`.

## Fluxo de trabalho

1. **Pedido ou prioridade:** o integrador confirma o objetivo e identifica quais especialidades ajudam.
2. **Diagnóstico paralelo:** agentes relevantes recebem tarefas de leitura/análise independentes. Cada tarefa informa objetivo, escopo, fontes, limites e formato da resposta.
3. **Síntese:** o integrador remove duplicações, confere evidências e entrega ao diretor bugs confirmados, propostas e decisões necessárias.
4. **Aprovação do diretor:** opções de produto, gameplay, balanceamento ou mudanças com impacto visível aguardam decisão. Nada é implementado apenas por ter sido recomendado.
5. **Implementação:** após aprovação, o integrador delega ao programador frontend ou backend conforme a área. Direção visual e produção de arte podem ser delegadas ao designer criativo, com entregáveis e limites definidos; integração no jogo continua sob responsabilidade frontend. Cada agente editor usa sua própria branch/worktree quando possível; arquivos compartilhados têm um responsável por vez.
6. **Revisão e integração:** o integrador confere regras, escopo e diff; executa build/verificações aplicáveis; devolve resultado e limitações ao diretor. Não publica, faz merge remoto ou envia alterações ao GitHub sem pedido explícito.

## Formato dos relatórios

Relatórios de análise devem ser curtos e incluir:

- **Achado:** bug, risco, oportunidade ou gargalo.
- **Evidência:** reprodução, cálculo, métrica, arquivo e função relevantes.
- **Impacto e prioridade:** o que o jogador/equipe percebe e urgência sugerida.
- **Recomendação:** mudança sugerida e alternativas quando houver uma decisão de direção.
- **Esforço e risco:** pequeno/médio/grande, dependências e possíveis regressões.
- **Aprovação necessária:** pergunta objetiva para o diretor, ou “nenhuma” se for apenas diagnóstico.

Ideias ainda não aprovadas são propostas, não requisitos. Se duas recomendações entrarem em conflito, o integrador apresenta o conflito ao diretor antes da implementação.

## Limites práticos

- Os agentes são colaboradores por tarefa, não processos permanentes que ficam monitorando o repositório.
- O integrador deve invocá-los quando uma tarefa precisar de análise paralela e encaminhar o contexto relevante.
- Um agente de análise pode recomendar testes; criação de uma nova suíte de testes deve ser uma tarefa aprovada separadamente.
- Não inventar métricas: se não houver instrumentação ou ambiente de medição, registrar a limitação e sugerir como obter evidência.
