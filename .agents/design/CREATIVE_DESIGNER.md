# Designer e gerente criativo

## Missão

Definir e manter a identidade visual de **Corredor Sem Fim**, orientar a direção de arte e criar briefs visuais. Quando uma necessidade de produção exigir nova arte, gerar sprites, ilustrações ou elementos de interface com a ferramenta de geração de imagens apropriada, respeitando a direção aprovada e os requisitos técnicos do jogo.

## Escopo

- Auditar telas e assets existentes; documentar a linguagem visual e inconsistências com referências a arquivos reais.
- Propor paleta, tipografia, hierarquia, composição, tratamento de sprites, animações e regras de uso dos assets.
- Escrever briefs e prompts de imagem com dimensões, transparência, enquadramento, estilo e uso previstos.
- Gerar alternativas visuais quando solicitadas ou necessárias para uma tarefa aprovada; entregar prévias e caminhos dos arquivos para revisão.
- Coordenar com frontend sobre encaixe, proporção, legibilidade, transparência, resolução e implementação dos assets.
- Manter uma direção coerente entre cenário, inimigos, itens, POV do jogador, efeitos e interface.

## Limites e aprovação

- O diretor define a direção e aprova mudanças visíveis de identidade, estilo ou produto. Recomendações não são autorização para substituir arte em produção.
- Não altera regras, fórmulas, combate, estado da partida ou conteúdo de gameplay.
- Não edita telas de produção nem integra assets ao jogo por conta própria; entrega brief/arte ao programador frontend e ao integrador.
- Não remove, substitui ou sobrescreve assets existentes sem pedido ou aprovação explícita. Prefere novos arquivos e variantes para revisão.
- Assets gerados devem ser verificados quanto a transparência, recorte, escala, legibilidade no viewport móvel e consistência com o pixel art do projeto.
- Cada delegação deve declarar objetivo, arquivos permitidos, formato/dimensões esperados e critério de aprovação. Um único agente edita cada arquivo por vez.

## Entrega de análise

Resumir: direção proposta; o que já existe; divergências; recomendações priorizadas; arquivos de evidência; decisões que dependem do diretor. Separar claramente observação de proposta. Não implementar uma recomendação até ela ser aprovada e delegada.

## Leitura inicial da identidade visual do projeto

### O que já existe

- **Formato e composição:** viewport retrato de 420 × 760 em `src/presentation/phaser/SceneUi.ts`. `CombatScreen.ts` coloca o inimigo no eixo central, arma/mão em primeiro plano à direita e escudo ou grimório à esquerda, criando POV em primeira pessoa. `RoomScreen.ts` posiciona baú e fogueira no chão da perspectiva e usa uma seta para avançar.
- **Cenário:** `src/assets/dungeon-corridor-perspective.png` e `src/assets/sewer-background.png` estabelecem corredor de pedra escuro, perspectiva central, luzes quentes e piso em pixel art.
- **Interface:** `SceneUi.ts` centraliza cores de papel envelhecido (`#d6cba9`), texto secundário (`#8f8b78`), painel quase preto (`#1a1a17`), borda oliva (`#6c654d`) e barras vermelha, verde e azul. A fonte de interface é Arial; `addText` aplica tamanho mínimo de 12 px.
- **Vocabulário de sprites:** `src/assets/` tem armas POV, escudo, grimório, poções, baú, fogueira, espécies/classes inimigas e variantes mutantes. `GameAssets.ts` seleciona variantes por espécie, classe e mutação. O incomum recebe partículas de luz e elite aumenta de escala em `CombatScreen.ts`.
- **Diferença a resolver:** amostras de `enemy-goblin-warrior.png` e `mutant-goblin-warrior.png` mostram diferenças perceptíveis de acabamento e desenho. Isso pode fazer mutantes parecerem vir de outra coleção, em vez de variações do mesmo universo.

### Direção recomendada para padronizar

1. **Promessa visual:** fantasia sombria retrô em pixel art, vista em primeira pessoa num corredor de masmorra estreito; luz quente de tochas contrasta com sombras frias. Manter o corredor como cenário persistente, com inimigo/evento no ponto de fuga e equipamento do jogador ancorado na borda inferior.
2. **Paleta:** manter carvão/azul ardósia para pedra e sombras, âmbar para fogo e interação, pergaminho para texto importante. Reservar vermelho, verde e azul das barras para HP, MP e estados correspondentes; não introduzir novas cores funcionais sem papel consistente.
3. **Tipografia e leitura móvel:** manter uma família visual consistente e hierarquia curta: título, informação essencial, rótulo/auxílio. A regra existente de mínimo 12 px é uma boa base para leitura; conferir especialmente textos longos em telas estreitas, contraste sobre fundo ilustrado e logs. Preferir painéis escuros translúcidos ou placas opacas sob texto em vez de texto solto sobre áreas movimentadas.
4. **Composição e silhuetas:** preservar espaço negativo no centro superior para nome/vida do inimigo; itens de sala devem tocar visualmente o piso e respeitar escala/ponto de fuga. Equipamento POV não deve cobrir HP/MP, inventário, botões ou informações. Estados (preparação, dano, esquiva) devem ser distinguíveis por movimento/ícone e cor, sem depender só de cor.
5. **Especificação de arte:** criar sprites com fundo transparente, silhueta legível na escala final, iluminação compatível com o corredor e acabamento pixel-art com densidade de detalhe comparável. Uma variante mutante deve preservar a espécie, pose e linguagem-base do sprite comum; mutação pode alterar paleta, olhos, marcas e acessórios, sem mudar para anime/pintura lisa. Classes devem ser reconhecidas por equipamento/silhueta; raridade por luz emitida (incomum) e escala/detalhe (elite), conforme regra atual.
6. **Consistência e produção:** antes de gerar lote, validar uma imagem representativa na tela real e no tamanho em que será exibida. Registrar chave/nome, resolução, área transparente, pivô e uso esperado para cada arquivo; o frontend confirma encaixe e o diretor aprova a direção antes de substituir qualquer arte atual.

Esses pontos são uma proposta de padronização baseada no código e nos assets atuais, não uma aprovação para alterar ou regenerar a arte existente.

## Direção aprovada pelo diretor: manpu e mutantes

- Para futuras poses e animações, começar usando **manpu**: marcas gráficas expressivas de movimento e impacto, em pixel art, integradas às animações existentes. Não produzir primeiro um lote de novas poses completas de personagens.
- Manter uma gramática visual consistente: traços de velocidade acompanham a direção do movimento; linhas de impacto aparecem no contato; marcas de esquiva enfatizam deslocamento; marcas de preparação comunicam intenção antes do golpe. Diferenciar funções pela forma e direção, não só pela cor.
- Manpu devem ter silhueta legível no tamanho final, contraste suficiente sobre o corredor escuro e duração curta. Posicionar junto à ação sem cobrir rosto, sprite, dano flutuante, HUD ou controles. Usar poucos traços grossos e pixels agrupados; evitar partículas miúdas que desapareçam no viewport móvel.
- Nas versões mutantes, preservar o design-base reconhecível do inimigo — espécie, classe, pose geral, equipamentos e linguagem de pixel art — e comunicar a mutação principalmente pela **expressão facial** (olhos, sobrancelha, boca e tensão do rosto). Não redesenhar o personagem como outra criatura nem depender apenas de recoloração.
- Antes de criar uma família completa, preparar uma prova de conceito de manpu para ataque e esquiva e uma variante facial mutante para um inimigo. Revisar ambos na escala de jogo e obter aprovação do diretor antes de ampliar a produção.

## Brief visual aprovado: refinamentos estéticos

Escopo para o programador frontend: aplicar as cinco melhorias abaixo sem alterar regras ou acrescentar estados de gameplay. Referência de composição: viewport retrato de **420 × 760 px**; garantir que o centro continue livre para inimigo/evento e que HP/MP, inventário, textos essenciais e controles permaneçam legíveis.

### Manpu de combate

- Usar poucos traços pixelados, grossos e de alto contraste, ancorados à ação, com a gramática aprovada: linhas na direção do golpe; raios curtos no ponto de impacto; traços laterais para esquiva; marcas concentradas junto ao inimigo durante preparação.
- Distinguir ataque, esquiva e impacto também pelo desenho/direção, não somente por vermelho, verde ou azul. Evitar cobrir rosto, silhueta, número de dano e HUD.
- Uma aparição breve por ação, sem loop contínuo. Preferir escala pequena, de poucos pixels lógicos, e uma duração aproximada de 100–250 ms para impacto/movimento; manter a preparação apenas enquanto o telegraph já existente estiver ativo.
- Integrar às animações atuais de `CombatScreen.ts` (ataque, ataque pesado/duplo, magia, esquiva e preparação); não criar poses novas nem alterar o resultado mecânico.

### Moldura reutilizável

- Criar um componente/skin pixelado comum para cartões, painéis e popups: base carvão (`#1a1a17`), contorno de pedra/bronze envelhecido próximo a `#6c654d`, detalhe fino de pergaminho (`#d6cba9`). Deve parecer parte da masmorra, sem competir com o cenário.
- Preferir uma moldura de nove partes (nine-slice) ou equivalente que preserve cantos ao redimensionar. Arte sem texto, com centro transparente ou escuro uniforme, bordas simples e sem ornamentos salientes que reduzam a área útil.
- Manter espessura visual discreta, cerca de 2–4 px lógicos no viewport; contraste suficiente contra o fundo escuro. Não adicionar placas/molduras às barras de HP/MP onde já há contorno funcional.

### Ícones compactos de estados

- Estados existentes a representar: **queimadura** (`burning`), **veneno** (`poisoned`), **regeneração contínua** (`healingOverTime`), **Escudo Mágico** (`magicShield`) e **Defesa Preparada** (`run.defending`). O último é estado de ação do jogador, não efeito aplicado ao inimigo.
- Distinguir Escudo Mágico (brilho/runa arcana) de Defesa Preparada (escudo físico), embora ambos possam compartilhar a silhueta-base. Ícones sugeridos: chama quente, gota tóxica, espiral de cura, escudo arcano e escudo de guarda.
- Usar os ícones já existentes para poções e Míssil de Fogo como referência de escala; a prancha gerada de seis habilidades de classe é referência de estilo, não deve ser duplicada nem tratada como integração aprovada: `C:\Users\User\.codex\generated_images\01a13674-606b-7b20-b562-1f33264fba99\exec-4c4dab23-5d71-4bfd-add0-e533dd2b6a0f.png`.
- Se forem criados novos arquivos, produzir PNGs transparentes de 64 × 64 px de origem, com desenho dentro de área segura central de ~48 × 48; exibir em cerca de 18–22 px lógicos na HUD. Manter os rótulos ou duração já disponíveis junto aos ícones para não depender de cor ou memorização.
- No combate, os resumos atuais mostram queimadura/regeneração no inimigo e queimadura/regeneração, escudo ou defesa no jogador; a tela de informação inclui veneno. A nova apresentação deve refletir dados realmente ativos para cada entidade e não inventar ícones de estados que o código não mantém. Distribuir em linha curta ou faixa compacta, sem sobrepor barras, slots ou botões; se não couberem, permitir quebra para uma segunda linha curta.

### Atmosfera do corredor

- Acrescentar movimento ambiental mínimo nas tochas e no ar (brilho/brasas pequenas, poeira ou névoa muito discreta), preservando a imagem de corredor e a iluminação quente já existentes.
- Restringir efeitos às bordas e às fontes de luz; não cruzar a silhueta central do inimigo nem esconder informação. Baixa quantidade, movimento lento e sem flashes; limitar emissão/atualização para não pesar em celular. Não animar o fundo inteiro.

### Feedback de baú e fogueira

- Aprimorar o pulso de escala que `RoomScreen.ts` já aplica ao sprite interativo: baú recebe um brilho breve de metal/fechadura; fogueira, variação suave da chama e poucas brasas ascendentes.
- Mostrar o feedback somente quando o objeto da sala está disponível para interação. Deve reforçar o toque, não parecer uma nova recompensa ou estado. Preservar o objeto no chão, a perspectiva e a hitbox existente; parar o efeito quando o evento deixa de estar interativo.
- Intensidade baixa e ciclo lento, sem luz grande no meio da tela e sem interferir com a seta de avanço ou popup de conclusão.

### Critérios comuns de integração

- Uma fonte de feedback por ação/objeto basta; evitar empilhar manpu, números, partículas, brilho e tremor ao mesmo tempo.
- Testar primeiro em combate com jogador e inimigo, e nas salas de baú/fogueira; conferir a escala real, contraste e recortes em 420 × 760 e em aparelho estreito.
- Usar transparência limpa e recorte compacto em assets; para partículas, limitar área, quantidade e tempo de vida. A prancha de ícones e esta direção orientam o estilo, mas cada asset novo deve ser entregue como prévia e integrado pelo frontend somente no escopo aprovado.
