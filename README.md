# Manual de Inicialização do Servidor

Este manual apresenta o passo a passo detalhado para instalar e rodar o Servidor de controle dos Protótipos do STEM Criar.

> **IMPORTANTE:**
> 1. Caso seja a sua primeira vez rodando o Servidor neste computador, você deve obrigatoriamente realizar os passos da seção [Cenário 1. Na primeira instalação](#cenário-1-na-primeira-instalação).
> 2. O computador (onde o Servidor está rodando), o seu celular/tablet de controle e o Protótipo **DEVEM estar todos conectados na mesma rede Wi-Fi**.

---

## Cenário 1. Na primeira instalação

Antes da primeira vez inicializando o Servidor no seu computador, será necessário baixar e instalar o `Node.js`. Essa etapa só precisa ser feita **uma vez** no seu computador.

1. Baixe o arquivo de instalação do Node.js [neste link](https://nodejs.org/dist/v24.14.1/node-v24.14.1-x64.msi).
2. Abra o arquivo baixado.
3. Siga as instruções de instalação (clique em "Next" até concluir).
4. Após instalado com sucesso, siga para o passo a passo do [Cenário 2. Para rodar o Servidor](#cenário-2-para-rodar-o-servidor).

> OBS: Este Cenário só precisa ser feito uma vez em seu computador.

<details>
<summary>Veja mais</summary>
<div align="center">
  <img src="img/Cenario1.gif" alt="Passo a passo da instalação do Node" width="800">
</div>
</details>

---

## Cenário 2. Para rodar o Servidor

Siga os passos abaixo toda vez que desejar iniciar o Servidor para controlar os Protótipos.

1. Baixe o código-fonte do Servidor em formato `.zip` clicando [neste link](https://github.com/stemcriar/servidor-stem-criar/archive/refs/tags/1.0.zip).
2. Encontre o arquivo baixado em seu computador, clique com o botão direito e selecione a opção para extrair/descompactar a pasta.
3. Abra a pasta descompactada e clique duas vezes no arquivo `run`.
4. Uma tela preta (terminal) se abrirá carregando as configurações e, em poucos segundos, o **Servidor STEM Criar** abrirá automaticamente em seu navegador padrão. Caso o Servidor não abra, veja [Possíveis Erros¹](#1-o-servidor-não-abre-após-clicar-no-run).
5. Com o Servidor aberto com sucesso, o próximo passo é conectar os Protótipos a ele. Consulte o [Manual de Configuração dos Protótipos](https://github.com/stemcriar/codigo-esp-prototipos/tree/main?tab=readme-ov-file#manual-de-configura%C3%A7%C3%A3o-dos-prot%C3%B3tipos) para realizar essa integração.

<details>
<summary>Veja mais</summary>
<div align="center">
  <img src="img/Cenario2.gif" alt="Rodando o Servidor" width="800">
</div>
</details>

---

## Possíveis Erros

### 1. O Servidor não abre após clicar no `run`.
* **Causa 1:** O `Node.js` não foi instalado corretamente. 
* **Solução 1:** Repita rigorosamente os passos da seção [Cenário 1. Na primeira instalação](#cenário-1-na-primeira-instalação).

* **Causa 2:** O Windows bloqueou a execução do arquivo por segurança.
* **Solução 2:** Ao clicar duas vezes no `run`, se uma tela azul do Windows Defender aparecer, clique em "Mais informações" e depois em "Executar assim mesmo".

### 2. Os Protótipos não conseguem se conectar ao Servidor.
* **Causa:** A rede Wi-Fi do seu computador está configurada como "Rede Pública", o que bloqueia a comunicação com os Protótipos por questões de segurança (Firewall).
* **Solução:** No seu computador, vá nas configurações de Rede e Internet, clique na sua conexão Wi-Fi atual e altere o perfil de rede de "Pública" para "Privada". Em seguida, feche o Servidor e abra novamente pelo arquivo `run`.

### 3. A tela do Servidor abriu, mas nenhum Protótipo aparece.
* **Causa:** Os Protótipos ainda não foram configurados para buscar este Servidor ou estão em redes diferentes.
* **Solução:** Certifique-se de que o Protótipo e o computador estão na mesma rede Wi-Fi. Siga o [Manual de Configuração dos Protótipos](https://github.com/stemcriar/codigo-esp-prototipos/tree/main?tab=readme-ov-file#manual-de-configura%C3%A7%C3%A3o-dos-prot%C3%B3tipos) para apontar o IP correto do Servidor para o robô.
