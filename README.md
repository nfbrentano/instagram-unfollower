# InstaUnfollow - Quem não te segue de volta?

Uma extensão simples, moderna e segura para Google Chrome (Manifest V3) que identifica quais contas você segue no Instagram mas que não te seguem de volta, permitindo exportação e remoção individual ou em lote.

---

## 🚀 Funcionalidades

- **Scan em Tempo Real**: Veja os resultados sendo atualizados dinamicamente à medida que sua lista é escaneada.
- **Persistência de Dados**: O último scan fica salvo localmente no navegador, sem precisar reescanear ao reabrir o popup.
- **Filtro de Busca em Tempo Real**: Busque não-seguidores instantaneamente por username ou nome completo.
- **Links Diretos**: Clique no `@username` para abrir o perfil em nova aba e inspecionar a conta.
- **Exportação CSV**: Baixe a lista completa de não-seguidores em formato `.csv` com um clique.
- **Unfollow Seguro**:
  - Remoção individual com feedback de status.
  - Remoção em massa sequencial com intervalos graduais aleatórios (4 a 8 segundos) para proteger sua conta contra bloqueios e rate limit do Instagram.
- **Design Moderno**: Interface em modo escuro inspirada na identidade visual do Instagram.

---

## 🛠️ Instalação (Modo Desenvolvedor)

1. Clone ou baixe este repositório:
   ```bash
   git clone https://github.com/nfbrentano/instagram-unfollower.git
   ```
2. Abra o Google Chrome e acesse:
   ```text
   chrome://extensions/
   ```
3. Ative a chave **Modo do desenvolvedor** (Developer mode) no canto superior direito.
4. Clique em **Carregar sem compactação** (Load unpacked) e selecione a pasta deste projeto.
5. Acesse o [Instagram](https://www.instagram.com) e faça login na sua conta.
6. Clique no ícone da extensão no navegador para iniciar o scan.

---

## ⚠️ Aviso Legal

Esta ferramenta não é afiliada, autorizada ou mantida pela Meta / Instagram. O uso de automação pode violar os Termos de Serviço do Instagram. Use com moderação e responsabilidade.
