CREATE TYPE "public"."status_prazo" AS ENUM('pendente', 'cumprido', 'perdido');--> statement-breakpoint
CREATE TYPE "public"."tipo_prazo" AS ENUM('prazo', 'audiencia', 'reuniao');--> statement-breakpoint
CREATE TABLE "feriado" (
	"data" date PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prazo" (
	"id" serial PRIMARY KEY NOT NULL,
	"processo_id" integer NOT NULL,
	"tipo" "tipo_prazo" NOT NULL,
	"intimacao_em" date,
	"dias_uteis" integer,
	"vence_em" timestamp with time zone NOT NULL,
	"responsavel_id" integer NOT NULL,
	"status" "status_prazo" DEFAULT 'pendente' NOT NULL,
	"observacao" text,
	"criado_por" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prazo_dias_uteis_faixa" CHECK ("prazo"."dias_uteis" is null or ("prazo"."dias_uteis" between 1 and 365)),
	CONSTRAINT "prazo_contagem_completa" CHECK (("prazo"."intimacao_em" is null) = ("prazo"."dias_uteis" is null))
);
--> statement-breakpoint
ALTER TABLE "prazo" ADD CONSTRAINT "prazo_processo_id_processo_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processo"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prazo" ADD CONSTRAINT "prazo_responsavel_id_usuario_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."usuario"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prazo" ADD CONSTRAINT "prazo_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prazo_vence_idx" ON "prazo" USING btree ("vence_em");--> statement-breakpoint
CREATE INDEX "prazo_processo_idx" ON "prazo" USING btree ("processo_id");--> statement-breakpoint
CREATE INDEX "prazo_responsavel_idx" ON "prazo" USING btree ("responsavel_id");