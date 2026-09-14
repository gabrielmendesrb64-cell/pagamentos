# Controle de Dívidas — versão reajustada para Render

Painel pessoal privado para registrar dívidas, pagamentos parciais e comprovantes.

## Dados iniciais

- Vinicius: R$ 29.000,00 — saldo R$ 29.000,00.
- Guilherme: R$ 13.000,00 — já pagou R$ 1.000,00 — saldo R$ 12.000,00.
- Paulo: R$ 800,00 — já pagou R$ 350,00 — saldo R$ 450,00.
- Total inicial a receber: R$ 41.450,00.

## Correção aplicada para o Render

O projeto agora força **Node.js 22.16.0** em três lugares:

- `package.json`
- `.node-version`
- `render.yaml`

Isso evita o Render escolher Node 26, que foi a causa do erro de compilação do `better-sqlite3` no deploy anterior.

## Configuração no Render

No serviço Web Service, use:

**Build Command**

```bash
npm install
```

**Start Command**

```bash
npm start
```

Em **Environment**, crie estas variáveis:

```text
NODE_VERSION=22.16.0
NODE_ENV=production
ADMIN_USER=admin
ADMIN_PASSWORD=SUA_SENHA_FORTE
SESSION_SECRET=UMA_CHAVE_GRANDE_E_ALEATORIA_COM_32_OU_MAIS_CARACTERES
```

Não precisa definir `PORT`; o Render fornece automaticamente.

Depois faça **Manual Deploy > Clear build cache & deploy**. É importante limpar o cache para o Render não reutilizar a instalação feita com Node 26.

No começo do novo log, confira se aparece Node `22.16.0` (ou Node 22), e não Node 26.

## Segurança

O arquivo `.env` NÃO está incluído neste pacote. Não publique senhas no GitHub.

Se você já publicou um `.env` no repositório anterior, remova-o do GitHub e troque a senha usada nele antes de colocar o serviço online.

## Armazenamento no Render gratuito

O site funciona no Render gratuito, porém o disco local do serviço gratuito é temporário. O SQLite e os comprovantes podem ser perdidos quando a instância for recriada/reiniciada.

Para guardar dados e comprovantes de forma permanente, depois vale migrar banco e arquivos para um serviço persistente como Supabase ou outra solução de banco + storage.

## Uso local

Crie um arquivo `.env` copiando `.env.example` e preencha sua senha e o segredo da sessão. Depois:

```bash
npm install
npm start
```

Abra `http://localhost:3000`.
