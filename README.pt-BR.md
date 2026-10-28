[English](README.md) · [Español](README.es.md) · **Português (Brasil)** · [Polski](README.pl.md)

# Hunt Planner

Onde caçar agora? O Hunt Planner responde isso para jogadores de Tibia, em torno do quadro de Bounty Tasks: digite suas três ofertas de bounty (ou a que você escolheu) e ele monta um plano curto: vá para este spot, para esta oferta; ocupado? tente aquele; senão, faça reroll. Ele leva em conta sua bounty, suas tasks semanais, a criatura boosted do dia e a prey, e o que você busca na hunt (exp, lucro, pontos de charm ou pontos de bounty).

**Abra aqui: https://anthonygdi2.github.io/hunt-planner/** (instale pelo navegador, em “Instalar app” ou “Adicionar à tela inicial”, para usar offline).

<p>
  <img src="docs/screenshots/plan.png" width="260" alt="A tela Plano: os dados que o plano usa e depois o Passo 1, ir para Upper Roshamuul, com exp/h, lucro/h e os botões Livre e Ocupado">
  <img src="docs/screenshots/spots.png" width="260" alt="A tela Spots: busca, ordenação e filtros, e depois os spots com pontuação, exp/h, lucro/h, criaturas e origem dos dados">
  <img src="docs/screenshots/creatures.png" width="260" alt="A tela Criaturas: as criaturas de bounty em linhas por tier, começando pela S, para tasks Master">
</p>

As capturas mostram o app em inglês. O app está em português: na primeira vez ele usa o idioma do seu navegador, e você pode trocar na primeira tela ou em **Personagens e configurações**. Os nomes de criaturas e spots ficam como o Tibia mostra.

## O que ele faz

- **Plano**: os passos para agora, cada um com Livre e Ocupado (spots marcados como ocupados são pulados por um tempo) e um “Por quê?” embaixo.
- **Spots**: todo spot de hunt que serve para sua vocação e level, pontuado para o seu objetivo, mostrando de onde vêm os números.
- **Criaturas**: toda criatura de bounty classificada de S a D para o seu objetivo, suas listas Preferred e Unwanted com as chances que elas dão, e os spots, o bestiário e as notas de cada criatura.
- **Semanal**: suas tasks semanais, para que spots com tasks abertas pontuem mais, e qual dificuldade semanal paga mais exp no seu level.
- **Registrar uma hunt limpa**: cole o texto do Hunting Session Analyser do Tibia e os números daquele spot passam a ser os seus. Até lá, hunts de referência publicadas preenchem os dados, e elas se ajustam a você depois de algumas hunts registradas.

## Seus dados

Tudo o que você digita fica no seu próprio navegador: não tem conta nem servidor. Use **Personagens e configurações → Baixar backup** para guardar uma cópia ou levar para outro aparelho. O backup tem seus personagens e hunts, então não poste ele em público (por exemplo, numa issue).

## De onde vêm os números

- Dados das criaturas, exp das criaturas e regras dos bônus do dia: [TibiaWiki](https://tibia.fandom.com/wiki/Task_Board), sob CC BY-SA.
- Hunts de referência: lidas dos [vídeos de hunt do Kusnier](https://www.youtube.com/@Kusnierr/videos), com a permissão dele (também listados no [TibiaPal](https://tibiapal.com)), cada uma com link para o vídeo.
- As regras do jogo, suas fontes e as licenças de cada arquivo de dados estão no [README em inglês](README.md#where-the-numbers-come-from).

Tibia é uma marca registrada da CipSoft GmbH. O Hunt Planner é um projeto de fã e não é afiliado nem endossado pela CipSoft.

## Problemas e ideias

[Abra uma issue](https://github.com/anthonygdi2/hunt-planner/issues): o que você fez, o que esperava e o que aconteceu (uma captura de tela ajuda). Se algo da tradução soar estranho, avise lá também. Para ajudar com o código ou os dados, veja o [CONTRIBUTING.md](CONTRIBUTING.md) (em inglês).

## Licença

O código está sob a [licença MIT](LICENSE). Os arquivos de dados mantêm suas próprias licenças (os dados do TibiaWiki são CC BY-SA) e a fonte usa a SIL Open Font License; os detalhes estão no [README em inglês](README.md#license).

---

*Esta tradução pode estar atrás do [README em inglês](README.md), que é a versão de referência.*
