# Controle de Dívidas — PRO V3

Painel privado para controle de recebíveis, pagamentos e comprovantes.

## O que mudou nesta versão

- Visual totalmente refeito em tema claro: branco, cinza suave e verde petróleo.
- Menu lateral compacto com ícones no tamanho correto.
- Dashboard mais limpo, cards financeiros e fichas individuais mais profissionais.
- Tela de login refeita.
- Área **Minha conta** para alterar usuário e senha.
- Ao alterar a senha, **todas as sessões são encerradas**, inclusive a atual, e o sistema volta para a tela de login. A senha antiga deixa de autenticar naquela base de dados.
- CSS e JavaScript sem cache forte no navegador. Isso evita o problema de HTML novo carregar junto com CSS/JS antigo após um deploy no Render.
- Assets usam versão (`?v=3.0.0`) para forçar a atualização visual após o deploy.

## Dados iniciais

- Vinicius: R$ 29.000,00 pendentes.
- Guilherme: R$ 13.000,00 original / R$ 1.000,00 pago / R$ 12.000,00 pendentes.
- Paulo: R$ 800,00 original / R$ 350,00 pago / R$ 450,00 pendentes.

## Render

Build Command:

```bash
npm install
```

Start Command:

```bash
npm start
```

Variáveis de ambiente:

```text
NODE_VERSION=22.16.0
NODE_ENV=production
ADMIN_USER=admin
ADMIN_PASSWORD=SUA_SENHA_INICIAL
SESSION_SECRET=UMA_CHAVE_GRANDE_E_ALEATORIA_COM_32_OU_MAIS_CARACTERES
```

Use **Manual Deploy > Clear build cache & deploy** quando substituir uma versão antiga.

## Importante sobre o Render gratuito

O projeto atualmente usa SQLite e armazena comprovantes no disco local. Em serviços com armazenamento efêmero, um novo deploy/restart pode recriar a base a partir das variáveis de ambiente e apagar alterações locais. Para uso definitivo, o ideal é conectar um banco e armazenamento persistentes. Isso é especialmente importante para preservar pagamentos, comprovantes e alterações de senha.
