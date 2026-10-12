CREATE TYPE "public"."area_processo" AS ENUM('civel', 'trabalhista', 'familia', 'criminal', 'tributario', 'empresarial');--> statement-breakpoint
CREATE TYPE "public"."status_processo" AS ENUM('em_andamento', 'suspenso', 'arquivado', 'encerrado');--> statement-breakpoint
CREATE TABLE "processo" (
	"id" serial PRIMARY KEY NOT NULL,
	"numero_cnj" text NOT NULL,
	"cliente_id" integer NOT NULL,
	"area" "area_processo" NOT NULL,
	"vara" text NOT NULL,
	"status" "status_processo" DEFAULT 'em_andamento' NOT NULL,
	"responsavel_id" integer NOT NULL,
	"aberto_em" date NOT NULL,
	"criado_por" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processo_numero_cnj_unique" UNIQUE("numero_cnj")
);
--> statement-breakpoint
ALTER TABLE "processo" ADD CONSTRAINT "processo_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processo" ADD CONSTRAINT "processo_responsavel_id_usuario_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."usuario"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processo" ADD CONSTRAINT "processo_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "processo_cliente_idx" ON "processo" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "processo_responsavel_idx" ON "processo" USING btree ("responsavel_id");--> statement-breakpoint
CREATE INDEX "processo_status_idx" ON "processo" USING btree ("status");