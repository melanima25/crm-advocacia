CREATE TYPE "public"."tipo_cliente" AS ENUM('PF', 'PJ');--> statement-breakpoint
CREATE TABLE "cliente" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" "tipo_cliente" NOT NULL,
	"nome" text NOT NULL,
	"documento" text,
	"email" text,
	"telefone" text,
	"criado_por" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cliente_nome_idx" ON "cliente" USING btree ("nome");