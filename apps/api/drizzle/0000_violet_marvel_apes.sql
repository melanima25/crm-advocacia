CREATE TYPE "public"."perfil" AS ENUM('admin', 'advogado', 'assistente');--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer,
	"entidade" text NOT NULL,
	"entidade_id" text,
	"acao" text NOT NULL,
	"diff" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessao" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tentativa_login" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"sucesso" boolean NOT NULL,
	"ocorrida_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuario" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text NOT NULL,
	"perfil" "perfil" NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuario_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessao" ADD CONSTRAINT "sessao_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_criado_idx" ON "auditoria" USING btree ("criado_em");--> statement-breakpoint
CREATE INDEX "sessao_usuario_idx" ON "sessao" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "tentativa_email_idx" ON "tentativa_login" USING btree ("email","ocorrida_em");